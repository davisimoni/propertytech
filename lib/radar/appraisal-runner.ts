import "server-only";
import type { PropertyType, RadarSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { summariseAuctionAppraisal, AuctionAppraisalError } from "@/lib/ai/auction-appraisal";
import { evaluateRisk } from "@/lib/radar/risk";
import { geocodeZona } from "@/lib/radar/geocode";
import { reportAiError } from "@/lib/observability/report-error";

/**
 * Legge la perizia, scrive l'esito e riporta sulla scheda ciò che il PDF dice.
 *
 * # Perché sta qui e non dentro una rotta
 *
 * Perché a chiamarla sono due percorsi che devono comportarsi in modo
 * identico: il caricamento su un lotto già in elenco, e la creazione di una
 * scheda a partire dalla perizia. Le regole delicate — quali campi si possono
 * sovrascrivere e quali no — se esistessero in due copie divergerebbero al
 * primo ritocco, e a divergere sarebbe proprio la riga che decide se una
 * verifica già fatta dall'agente viene cancellata in silenzio.
 *
 * # Non lancia mai
 *
 * Gira dentro `after()`, cioè quando la risposta HTTP è già partita: da lì
 * un'eccezione non ha più nessuno a cui essere comunicata. L'unico canale
 * rimasto è lo stato sulla scheda, e lasciar propagare l'errore significherebbe
 * una scheda ferma su "in analisi" per sempre — il modo peggiore di fallire,
 * perché è indistinguibile da un'analisi lenta.
 */

/** I campi della scheda che le regole di scrittura devono poter leggere. */
export interface RadarSnapshot {
  id: string;
  basePriceEur: number | null;
  address: string | null;
  comune: string;
  zona: string | null;
  auctionDate: Date | null;
  lotto: string | null;
  source: RadarSource;
  type: PropertyType;
  priceEur: number;
  squareMeters: number;
}

export async function runAppraisal(params: {
  radar: RadarSnapshot;
  appraisalId: string;
  organizationId: string;
  pdfBase64: string;
}): Promise<void> {
  const { radar, appraisalId, organizationId, pdfBase64 } = params;
  const id = radar.id;

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
      where: { id: appraisalId },
      data: {
        status: "PRONTA",
        occupancy: fatti.occupancy,
        irregularities: fatti.irregularities,
        encumbrances: fatti.encumbrances,
        remediationCostMinEur: fatti.remediationCostMinEur,
        remediationCostMaxEur: fatti.remediationCostMaxEur,
        saleType: fatti.saleType,
        depositPct: fatti.depositPct,
        summary: fatti.summary,
        summaryPoints: fatti.summaryPoints,
        risk: verdetto.risk,
        riskReasons: verdetto.reasons,
      },
    });

    /*
     * I dati che la perizia porta e che l'agente non deve ricopiare: valore
     * di stima, indirizzo, data della vendita e numero di lotto.
     *
     * Scritti solo se mancano. Un valore inserito a mano e' una decisione
     * dell'agenzia, e sovrascriverla con quella del perito cancellerebbe
     * una correzione voluta.
     */
    const daPerizia: {
      basePriceEur?: number;
      address?: string;
      auctionDate?: Date;
      lotto?: string;
      comune?: string;
      type?: PropertyType;
      squareMeters?: number;
      priceEur?: number;
    } = {};

    if (fatti.appraisedValueEur && !radar.basePriceEur) {
      daPerizia.basePriceEur = fatti.appraisedValueEur;
    }
    if (fatti.propertyAddress?.trim() && !radar.address) {
      daPerizia.address = fatti.propertyAddress.trim();
    }

    /*
     * La data passa da una verifica prima di finire a database.
     *
     * Il modello la restituisce come stringa ISO, e una stringa che non e'
     * una data valida scriverebbe `Invalid Date`: un'asta che poi non
     * compare in nessun elenco ordinato per data, e che nessuno va a
     * cercare perche' la scheda sembra a posto.
     */
    if (fatti.auctionDate && !radar.auctionDate) {
      const quando = new Date(fatti.auctionDate);
      if (!Number.isNaN(quando.getTime())) daPerizia.auctionDate = quando;
    }
    if (fatti.lotto?.trim() && !radar.lotto) {
      daPerizia.lotto = fatti.lotto.trim();
    }

    /*
     * I campi obbligatori si toccano SOLO sulle schede nate da una perizia.
     *
     * Su una scheda compilata a mano comune, tipologia, offerta minima e
     * superficie li ha scritti l'agente guardando l'avviso di vendita:
     * sovrascriverli con la lettura del PDF cancellerebbe una verifica gia'
     * fatta, e lo farebbe in silenzio mentre lui guarda un'altra pagina.
     *
     * Sulle schede PERIZIA quegli stessi campi nascono come segnaposto
     * vuoti in attesa proprio di questa scrittura — e' l'intero motivo per
     * cui si puo' partire dal PDF invece che dalla tastiera.
     */
    if (radar.source === "PERIZIA") {
      if (fatti.comune?.trim() && !radar.comune.trim()) {
        daPerizia.comune = fatti.comune.trim();
      }
      // `ALTRO` e' il segnaposto della bozza: l'estrazione lo rimpiazza con
      // una tipologia precisa, ma non tocca una scelta gia' specifica.
      if (fatti.propertyType && radar.type === "ALTRO") {
        daPerizia.type = fatti.propertyType;
      }
      if (fatti.squareMeters && radar.squareMeters === 0) {
        daPerizia.squareMeters = fatti.squareMeters;
      }
      /*
       * L'offerta minima resta spesso vuota, ed e' giusto cosi'.
       *
       * Quasi sempre compare nell'avviso di vendita e non nella perizia: il
       * prompt vieta espressamente di ricavarla con un calcolo, perche' una
       * cifra dedotta su cui si decide un rilancio e' peggio di un campo che
       * l'agente vede vuoto e va a cercare.
       */
      if (fatti.minimumBidEur && radar.priceEur === 0) {
        daPerizia.priceEur = fatti.minimumBidEur;
      }
    }

    if (Object.keys(daPerizia).length > 0) {
      await prisma.radarProperty.update({ where: { id }, data: daPerizia });
    }

    /*
     * Con un indirizzo nuovo il pin va rifatto: prima stava sul centro del
     * comune, ora si puo' mettere sul portone. Se la ricerca fallisce il
     * lotto resta dov'era — un'analisi riuscita non deve fallire per un
     * servizio di mappe che non risponde.
     */
    if (daPerizia.address) {
      const posizione = await geocodeZona(
        daPerizia.comune ?? radar.comune,
        radar.zona,
        daPerizia.address
      );
      if (posizione) {
        await prisma.radarProperty.update({
          where: { id },
          data: { latitude: posizione.latitude, longitude: posizione.longitude },
        });
      }
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

    /*
     * Solo ciò che non è già stato segnalato alla sorgente.
     *
     * Un `AuctionAppraisalError` l'ha già mandato a Sentry
     * `auction-appraisal.ts`: rifarlo qui produrrebbe due eventi per lo stesso
     * guasto. Tutto il resto — una scrittura a database fallita, un campo
     * inatteso — succede solo qui, dentro `after()`, dove la risposta HTTP è
     * già partita e nessuno se ne accorgerebbe.
     */
    if (!(error instanceof AuctionAppraisalError)) {
      reportAiError(error, "appraisal-runner");
    }

    console.error("[RADAR-APPRAISAL] Analisi non riuscita", {
      organizationId,
      radarPropertyId: id,
      codice: error instanceof AuctionAppraisalError ? error.code : "unknown",
    });

    await prisma.auctionAppraisal
      .update({
        where: { id: appraisalId },
        data: { status: "FALLITA", failureReason: messaggio },
      })
      .catch(() => {
        // Se non riusciamo nemmeno a scrivere il fallimento non resta altro
        // da fare: la scheda mostrera' "in analisi" e l'agente ricarichera'.
        console.error("[RADAR-APPRAISAL] Stato di fallimento non salvato", { id });
      });
  }
}
