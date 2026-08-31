import { NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkUsageLimit, incrementUsage } from "@/lib/usage";
import { summariseAuctionAppraisal, AuctionAppraisalError, APPRAISAL_MODEL } from "@/lib/ai/auction-appraisal";
import { evaluateRisk } from "@/lib/radar/risk";

/**
 * Analisi della perizia, asincrona.
 *
 * # Perché non si risponde dopo aver finito
 *
 * Una perizia giudiziaria sta fra le trenta e le centoventi pagine. Leggerla
 * richiede più di quanto una richiesta HTTP possa restare aperta senza che
 * l'agente concluda che il caricamento è bloccato — e su Vercel oltre il
 * limite la funzione viene troncata a metà, lasciando un errore generico e
 * nessun risultato.
 *
 * Qui la richiesta risponde **202 subito**: la scheda esiste già, in stato
 * "in analisi". Il lavoro prosegue in `after()`, che Next esegue dopo aver
 * inviato la risposta, e scrive l'esito quando è pronto. La scheda si
 * aggiorna da sola.
 *
 * # Il limite resta, e va detto
 *
 * `after()` gira dentro la stessa invocazione, quindi `maxDuration` vale
 * ancora: una perizia molto lunga può non farcela. Per quello esiste
 * l'intervallo di pagine — l'agente indica dove stanno le sezioni che contano
 * e l'analisi lavora su quelle. Quando il tempo scade lo stato diventa
 * FALLITA con un messaggio che dice esattamente questo, invece di restare
 * "in analisi" per sempre.
 */

export const maxDuration = 60;

/** Oltre questa soglia il PDF non arriva nemmeno al modello. */
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const appraisal = await prisma.auctionAppraisal.findFirst({
    where: { radarPropertyId: id, organizationId: session.user.organizationId },
  });

  return NextResponse.json({ appraisal });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const organizationId = session.user.organizationId;
  const { id } = await context.params;

  const radar = await prisma.radarProperty.findFirst({
    where: { id, organizationId },
    select: { id: true, basePriceEur: true },
  });
  if (!radar) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Stesso credito dell'analisi documentale: è la stessa pipeline, e un
  // contatore separato costringerebbe l'agenzia a ragionare su due budget per
  // la stessa cosa. Verificato PRIMA di consumare (CLAUDE.md §4).
  const limite = await checkUsageLimit(organizationId, "documents");
  if (limite) return limite;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const pageRange = String(form?.get("pageRange") ?? "").trim();

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

  /*
   * Il PDF resta in memoria e non viene mai salvato.
   *
   * Una perizia contiene nome e situazione dell'esecutato: persone che non
   * sono clienti dell'agenzia e non hanno acconsentito a nulla. Di quel
   * documento conserviamo la sintesi tecnica, da cui il prompt esclude
   * l'identità. Chi vuole archiviare il PDF lo carica nel Fascicolo, dove la
   * conservazione è una scelta esplicita e datata.
   */
  const pdfBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  // La scheda nasce ora, in "in analisi": l'agente vede subito che il lavoro
  // è partito. `upsert` perché ricaricare una perizia rianalizza lo stesso
  // lotto invece di accumulare schede.
  const appraisal = await prisma.auctionAppraisal.upsert({
    where: { radarPropertyId: id },
    create: {
      radarPropertyId: id,
      organizationId,
      status: "IN_ANALISI",
      pageRange: pageRange || null,
      model: APPRAISAL_MODEL,
    },
    update: {
      status: "IN_ANALISI",
      failureReason: null,
      pageRange: pageRange || null,
      model: APPRAISAL_MODEL,
      summary: null,
      riskReasons: [],
      irregularities: [],
      encumbrances: [],
    },
  });

  await incrementUsage(organizationId, "documents");

  /*
   * Il lavoro vero, dopo la risposta.
   *
   * Nessuna eccezione può sfuggire da qui: `after()` gira quando la risposta
   * è già partita, quindi un errore non ha più nessuno a cui essere
   * comunicato se non la riga di stato sulla scheda. Lasciarlo propagare
   * significherebbe una scheda ferma su "in analisi" per sempre, che è il
   * modo peggiore di fallire — indistinguibile da un'analisi lenta.
   */
  after(async () => {
    try {
      const fatti = await summariseAuctionAppraisal(pdfBase64);

      // Il semaforo lo calcola il codice, non il modello: criteri dichiarati
      // in lib/radar/risk.ts e mostrati accanto al colore.
      const verdetto = evaluateRisk({
        occupancy: fatti.occupancy,
        irregularities: fatti.irregularities,
        encumbrances: fatti.encumbrances,
        remediationCostMaxEur: fatti.remediationCostMaxEur,
        basePriceEur: radar.basePriceEur ?? fatti.appraisedValueEur,
      });

      await prisma.auctionAppraisal.update({
        where: { id: appraisal.id },
        data: {
          status: "PRONTA",
          occupancy: fatti.occupancy,
          irregularities: fatti.irregularities,
          encumbrances: fatti.encumbrances,
          remediationCostMinEur: fatti.remediationCostMinEur,
          remediationCostMaxEur: fatti.remediationCostMaxEur,
          summary: fatti.summary,
          risk: verdetto.risk,
          riskReasons: verdetto.reasons,
        },
      });

      // Il valore di perizia torna utile sul lotto: è il termine di paragone
      // dell'offerta minima, e finora l'agente doveva copiarlo a mano.
      if (fatti.appraisedValueEur && !radar.basePriceEur) {
        await prisma.radarProperty.update({
          where: { id },
          data: { basePriceEur: fatti.appraisedValueEur },
        });
      }

      console.info("[RADAR-APPRAISAL] Sintesi completata", {
        organizationId,
        radarPropertyId: id,
        rischio: verdetto.risk,
      });
    } catch (error) {
      const messaggio =
        error instanceof AuctionAppraisalError
          ? error.message
          : "L'analisi non è riuscita a concludersi nel tempo disponibile. Riprova indicando un intervallo di pagine più ristretto.";

      console.error("[RADAR-APPRAISAL] Analisi non riuscita", {
        organizationId,
        radarPropertyId: id,
        codice: error instanceof AuctionAppraisalError ? error.code : "unknown",
      });

      await prisma.auctionAppraisal
        .update({
          where: { id: appraisal.id },
          data: { status: "FALLITA", failureReason: messaggio },
        })
        .catch(() => {
          // Se non riusciamo nemmeno a scrivere il fallimento non resta altro
          // da fare: la scheda mostrera' "in analisi" e l'agente ricarichera'.
          console.error("[RADAR-APPRAISAL] Stato di fallimento non salvato", { id });
        });
    }
  });

  // 202: accettata, non completata. L'interfaccia interroga lo stato.
  return NextResponse.json({ appraisal, status: "IN_ANALISI" }, { status: 202 });
}
