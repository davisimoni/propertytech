import { NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkUsageLimit, incrementUsage } from "@/lib/usage";
import { APPRAISAL_MODEL } from "@/lib/ai/auction-appraisal";
import { runAppraisal } from "@/lib/radar/appraisal-runner";

/**
 * Crea una scheda partendo dalla perizia, invece che dalla tastiera.
 *
 * # Perché una rotta a sé e non quella di creazione normale
 *
 * Perché quella pretende comune, tipologia, offerta minima e superficie —
 * giustamente: sono i campi che un agente deve dichiarare quando inserisce un
 * lotto a mano, e allentare quella validazione indebolirebbe il percorso
 * manuale per far posto a questo. Qui invece quei valori non li fornisce
 * nessuno: li porta il PDF, e finché l'analisi non finisce la scheda nasce
 * con dei segnaposto.
 *
 * # Cosa resta se l'agente abbandona a metà
 *
 * Una scheda con i segnaposto e la sua analisi allegata. È voluto: il credito
 * è già stato speso e l'analisi è stata fatta davvero, quindi cancellarla da
 * soli butterebbe via qualcosa di pagato. Resta in elenco e si completa o si
 * archivia quando si vuole.
 */

export const maxDuration = 60;

/** Oltre questa soglia il PDF non arriva nemmeno al modello. */
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const organizationId = session.user.organizationId;

  // Fail-closed e PRIMA di creare qualunque cosa: se la quota è finita non
  // deve restare in elenco una scheda vuota che nessuno ha chiesto.
  const limite = await checkUsageLimit(organizationId, "radar");
  if (limite) return limite;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const pageRange = String(form?.get("pageRange") ?? "").trim();
  const kind = String(form?.get("kind") ?? "ASTA") === "RIBASSO" ? "RIBASSO" : "ASTA";

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "invalid_payload", message: "Allega la perizia in PDF." },
      { status: 400 }
    );
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "invalid_type", message: "La perizia deve essere un PDF." },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      {
        error: "too_large",
        message:
          "Il file supera i 15 MB. Esporta solo le pagine che servono, oppure comprimi la scansione.",
      },
      { status: 413 }
    );
  }

  // Il PDF resta in memoria e non viene mai salvato: vale qui la stessa
  // ragione dell'altra rotta — una perizia contiene i dati dell'esecutato.
  const pdfBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  /*
   * I segnaposto, e perché proprio questi.
   *
   * `comune` vuoto, prezzo e superficie a zero, tipologia ALTRO: sono i
   * valori che `runAppraisal` riconosce come "da riempire" sulle schede
   * PERIZIA. Nessuno di essi è un valore che un agente scriverebbe davvero,
   * quindi non c'è modo di scambiare un segnaposto per una scelta.
   */
  const radar = await prisma.radarProperty.create({
    data: {
      organizationId,
      kind,
      source: "PERIZIA",
      comune: "",
      type: "ALTRO",
      priceEur: 0,
      squareMeters: 0,
    },
    select: {
      id: true,
      basePriceEur: true,
      address: true,
      comune: true,
      zona: true,
      auctionDate: true,
      lotto: true,
      source: true,
      type: true,
      priceEur: true,
      squareMeters: true,
    },
  });

  const appraisal = await prisma.auctionAppraisal.create({
    data: {
      radarPropertyId: radar.id,
      organizationId,
      status: "IN_ANALISI",
      pageRange: pageRange || null,
      model: APPRAISAL_MODEL,
    },
  });

  await incrementUsage(organizationId, "radar");

  after(() => runAppraisal({ radar, appraisalId: appraisal.id, organizationId, pdfBase64 }));

  console.info("[RADAR-FROM-APPRAISAL]", { organizationId, radarPropertyId: radar.id });

  // 202: la scheda esiste, l'analisi no. L'interfaccia interroga lo stato e
  // poi rilegge la scheda per proporla in verifica.
  return NextResponse.json({ radarPropertyId: radar.id, status: "IN_ANALISI" }, { status: 202 });
}
