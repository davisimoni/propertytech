import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { previewFromExtraction } from "@/lib/history/entries";
import { checkUsageLimit, incrementUsage } from "@/lib/usage";
import { extractDocumentData, DocumentExtractionError } from "@/lib/ai/document-extractor";
import { syncPortfolioFromExtraction } from "@/lib/leads/portfolio-sync";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB — well under Claude's 32MB request limit once base64-encoded

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;

  const limitResponse = await checkUsageLimit(organizationId, "documents");
  if (limitResponse) {
    return limitResponse;
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file", message: "Nessun file selezionato." }, { status: 400 });
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "unsupported_file_type", message: "Formato non supportato: carica il documento in PDF. Da una foto puoi creare un PDF con l'app File del telefono." }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "file_too_large", message: "Il file supera i 15 MB. Riduci la risoluzione della scansione o carica solo le pagine con i dati catastali." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const pdfBase64 = buffer.toString("base64");

  try {
    const extraction = await extractDocumentData(pdfBase64);
    await incrementUsage(organizationId, "documents");

    // Arricchimento Lead Intelligence: accessorio e volutamente non bloccante.
    // Se l'incrocio con la pipeline lead fallisce, l'agente deve comunque
    // ricevere l'estrazione che ha appena pagato con un credito.
    await syncPortfolioFromExtraction(organizationId, extraction).catch((error) => {
      console.error("[api/documents/extract] Portfolio sync failed", error);
    });

    // Conservata in cronologia: prima viveva solo nello stato del browser e
    // spariva al primo aggiornamento della pagina, pur avendo consumato un
    // credito. Come l'arricchimento qui sopra, non è bloccante — un errore di
    // scrittura non deve far perdere all'agente il risultato appena pagato.
    const saved = await prisma.aiGeneration
      .create({
        data: {
          organizationId,
          createdById: session.user.userId ?? null,
          kind: "DOCUMENT_EXTRACTION",
          title: file.name.replace(/\.pdf$/i, "").slice(0, 160) || "Documento",
          preview: previewFromExtraction(extraction),
          output: extraction as Prisma.InputJsonValue,
        },
        select: { id: true },
      })
      .catch((error) => {
        console.error("[api/documents/extract] Salvataggio in cronologia non riuscito", error);
        return null;
      });

    return NextResponse.json({ extraction, generationId: saved?.id ?? null });
  } catch (error) {
    if (error instanceof DocumentExtractionError) {
      const status = error.code === "upstream_error" ? 502 : 422;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }

    console.error("[api/documents/extract] Unexpected error", error);
    return NextResponse.json({ error: "internal_error", message: "Errore imprevisto durante l'analisi. Riprova fra poco." }, { status: 500 });
  }
}
