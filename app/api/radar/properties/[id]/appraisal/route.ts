import { NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkUsageLimit, incrementUsage } from "@/lib/usage";
import { APPRAISAL_MODEL } from "@/lib/ai/auction-appraisal";
import { runAppraisal } from "@/lib/radar/appraisal-runner";

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
    select: {
      id: true,
      basePriceEur: true,
      address: true,
      comune: true,
      zona: true,
      // Letti da `runAppraisal`: senza, la regola "scrivi solo se manca" non
      // avrebbe modo di sapere se manca.
      auctionDate: true,
      lotto: true,
      // `source` decide se l'analisi puo' scrivere sui campi obbligatori.
      source: true,
      type: true,
      priceEur: true,
      squareMeters: true,
    },
  });
  if (!radar) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  /*
   * Contatore suo, non piu' quello dell'analisi documentale.
   *
   * Condividere il credito OCR sembrava semplificare, ma di fatto toglieva
   * ogni tetto: l'OCR e' illimitato su tutti i piani a pagamento, quindi la
   * perizia — un PDF di centinaia di pagine, la chiamata piu' cara della
   * piattaforma — non aveva alcun limite. Su un piano da 99 euro bastava
   * usarla con costanza per costare piu' di quanto rendeva.
   *
   * Ora il Radar ha la sua quota mensile (`radarAppraisalsLimit`): 5 sullo
   * Starter, 25 sul Professional, 100 sull'Enterprise, zero in prova.
   * Verificata PRIMA di consumare, fail-closed (CLAUDE.md §4).
   */
  const limite = await checkUsageLimit(organizationId, "radar");
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

  await incrementUsage(organizationId, "radar");

  /*
   * Il lavoro vero, dopo la risposta.
   *
   * La logica vive in `runAppraisal`, condivisa con la creazione a partire
   * dalla perizia: le regole su quali campi si possono sovrascrivere sono
   * delicate, e in due copie divergerebbero al primo ritocco. Non lancia mai —
   * da dentro `after()` la risposta è già partita, e un errore non avrebbe più
   * nessuno a cui essere comunicato se non la riga di stato sulla scheda.
   */
  after(() => runAppraisal({ radar, appraisalId: appraisal.id, organizationId, pdfBase64 }));

  // 202: accettata, non completata. L'interfaccia interroga lo stato.
  return NextResponse.json({ appraisal, status: "IN_ANALISI" }, { status: 202 });
}
