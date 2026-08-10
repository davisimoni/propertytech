import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFeatureAccess } from "@/lib/feature-access";
import { formatDate, isAllowedDataUrl } from "@/lib/documents/vault";

/** Scarica un documento del fascicolo, o lo elimina. */

/** Estrae tipo e byte da un data URI già validato in scrittura. */
function decodeDataUrl(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const separator = dataUrl.indexOf(";base64,");
  if (separator === -1) return null;

  const mime = dataUrl.slice("data:".length, separator);
  const base64 = dataUrl.slice(separator + ";base64,".length);

  return { mime, bytes: Buffer.from(base64, "base64") };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;

  const gate = await checkFeatureAccess(organizationId, "documentVault");
  if (gate) return gate;

  const { id } = await context.params;

  // `findFirst` con organizationId, non `findUnique` sull'id: l'id da solo
  // aprirebbe il documento di qualunque agenzia a chi lo conosce.
  const document = await prisma.agencyDocument.findFirst({
    where: { id, organizationId },
    select: { fileDataUrl: true, fileName: true, title: true },
  });

  if (!document) {
    return NextResponse.json({ error: "document_not_found" }, { status: 404 });
  }

  if (!document.fileDataUrl) {
    return NextResponse.json(
      { error: "no_file", message: "Questa voce non ha un file allegato." },
      { status: 404 }
    );
  }

  // Rivalidato in lettura e non solo in scrittura: un dato già in archivio
  // potrebbe essere stato inserito prima di questo controllo, e restituirlo
  // con un tipo eseguibile dalla nostra stessa origine sarebbe una XSS.
  if (!isAllowedDataUrl(document.fileDataUrl)) {
    return NextResponse.json({ error: "unsupported_file_type" }, { status: 415 });
  }

  const decoded = decodeDataUrl(document.fileDataUrl);
  if (!decoded) {
    return NextResponse.json({ error: "corrupted_file" }, { status: 500 });
  }

  const fileName = (document.fileName ?? document.title).replace(/["\r\n]/g, "");

  return new NextResponse(new Uint8Array(decoded.bytes), {
    headers: {
      "Content-Type": decoded.mime,
      // `attachment` e `nosniff`: il file lo ha caricato un utente, e il
      // browser non deve mai eseguirlo nell'origine dell'applicazione.
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "X-Content-Type-Options": "nosniff",
      // Documenti di clienti: non devono finire in nessuna cache condivisa.
      "Cache-Control": "private, no-store",
    },
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;

  const gate = await checkFeatureAccess(organizationId, "documentVault");
  if (gate) return gate;

  const { id } = await context.params;

  const document = await prisma.agencyDocument.findFirst({
    where: { id, organizationId },
    select: { id: true, retentionUntil: true },
  });

  if (!document) {
    return NextResponse.json({ error: "document_not_found" }, { status: 404 });
  }

  // Il termine di conservazione non blocca la cancellazione — l'agenzia è
  // titolare dei propri dati e può doverli cancellare anche su richiesta
  // dell'interessato — ma la richiede esplicita. Così un clic sbagliato non
  // porta via un documento che l'agenzia è tenuta a conservare, mentre una
  // decisione voluta passa senza ostacoli.
  const stillRetained = document.retentionUntil > new Date();
  const confirmed = new URL(request.url).searchParams.get("confirm") === "true";

  if (stillRetained && !confirmed) {
    return NextResponse.json(
      {
        error: "retention_active",
        retentionUntil: document.retentionUntil.toISOString(),
        message: `Questo documento va conservato fino al ${formatDate(document.retentionUntil)}. Conferma per eliminarlo comunque.`,
      },
      { status: 409 }
    );
  }

  await prisma.agencyDocument.delete({ where: { id: document.id } });

  return NextResponse.json({ deleted: true });
}
