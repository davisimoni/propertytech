import { AI_DISCLAIMER_SHORT } from "@/lib/compliance";
import { PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";
import { computeRoi } from "./roi";
import type { PropertyType, RadarKind } from "@prisma/client";

/**
 * Testo pronto da pubblicare o da inviare.
 *
 * # Perché è codice e non una chiamata al modello
 *
 * I dati ci sono già tutti: comune, tipologia, superficie, prezzo, margine.
 * Comporli è una funzione, e una funzione produce lo stesso testo domani —
 * mentre un modello ne produce uno diverso a ogni clic, e un'agenzia che
 * pubblica non vuole sorprese su cosa scrive a proprio nome. Costa anche
 * zero, che era il vincolo.
 *
 * # Perché due versioni e non una
 *
 * Sono due pubblici opposti. Il post su Facebook lo legge un potenziale
 * acquirente: raccontargli che l'agenzia stima un margine del 35% sul lotto
 * gli dice quanto pensiamo di guadagnarci, e non è un'informazione che aiuta a
 * vendere. La lettera all'investitore vive di quel numero.
 *
 * # Cosa NON entra mai nel testo pubblico
 *
 * Il semaforo di rischio e le difformità. Sono la lettura automatica di una
 * perizia, prodotta a supporto della valutazione dell'agente: trasformarle in
 * un'affermazione pubblica su un immobile significherebbe risponderne, e
 * basta una difformità descritta male perché diventi un problema
 * dell'agenzia.
 */

export type CopyVariant = "social" | "investitori";

export interface SocialCopyInput {
  kind: RadarKind;
  comune: string;
  zona: string | null;
  type: PropertyType;
  squareMeters: number;
  priceEur: number;
  basePriceEur: number | null;
  previousPriceEur: number | null;
  auctionDate: Date | string | null;
  transferCostsEur: number | null;
  renovationCostEur: number | null;
  marketValueEur: number | null;
  monthlyRentEur: number | null;
  agencyName: string;
}

const soldi = (v: number) => `${new Intl.NumberFormat("it-IT").format(v)} €`;

/** Percentuale di sconto sul riferimento, quando c'è ed è un vero sconto. */
function sconto(input: SocialCopyInput): number | null {
  const riferimento = input.kind === "ASTA" ? input.basePriceEur : input.previousPriceEur;
  if (!riferimento || riferimento <= input.priceEur) return null;
  return Math.round(((riferimento - input.priceEur) / riferimento) * 100);
}

export function buildSocialCopy(input: SocialCopyInput, variant: CopyVariant): string {
  const luogo = input.zona ? `${input.comune} (${input.zona})` : input.comune;
  const tipo = PROPERTY_TYPE_LABELS[input.type].toLowerCase();
  const percentuale = sconto(input);

  const roi = computeRoi({
    priceEur: input.priceEur,
    transferCostsEur: input.transferCostsEur,
    renovationCostEur: input.renovationCostEur,
    marketValueEur: input.marketValueEur,
    monthlyRentEur: input.monthlyRentEur,
  });

  if (variant === "social") {
    const righe = [
      `${input.kind === "ASTA" ? "OPPORTUNITÀ ALL'ASTA" : "NUOVO PREZZO"} — ${luogo}`,
      "",
      `${PROPERTY_TYPE_LABELS[input.type]} di ${input.squareMeters} mq.`,
      input.kind === "ASTA"
        ? `Offerta minima: ${soldi(input.priceEur)}.`
        : `Ora a ${soldi(input.priceEur)}.`,
    ];

    if (percentuale !== null) {
      righe.push(
        input.kind === "ASTA"
          ? `Il ${percentuale}% sotto il valore di perizia.`
          : `Ribassato del ${percentuale}%.`
      );
    }

    if (input.kind === "ASTA") {
      // Detto nel post, non nei commenti: chi si informa deve sapere subito
      // che non è una compravendita ordinaria.
      righe.push(
        "",
        "Si tratta di una vendita giudiziaria: condizioni e termini sono stabiliti dal Tribunale."
      );
      if (input.auctionDate) {
        const d = new Date(input.auctionDate);
        righe.push(
          `Vendita del ${d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}.`
        );
      }
    }

    righe.push(
      "",
      "Ti accompagniamo noi in tutte le fasi: documentazione, visita e presentazione dell'offerta.",
      `Scrivici per i dettagli. — ${input.agencyName}`
    );

    return righe.join("\n");
  }

  // --- Investitori ---------------------------------------------------------
  const righe = [
    `Opportunità d'investimento — ${luogo}`,
    "",
    `${PROPERTY_TYPE_LABELS[input.type]} di ${input.squareMeters} mq, ${tipo} ${
      input.kind === "ASTA" ? "in vendita giudiziaria" : "a prezzo ribassato"
    }.`,
    `${input.kind === "ASTA" ? "Offerta minima" : "Prezzo"}: ${soldi(input.priceEur)}.`,
  ];

  if (percentuale !== null) {
    righe.push(`${percentuale}% sotto il ${input.kind === "ASTA" ? "valore di perizia" : "prezzo precedente"}.`);
  }

  if (input.renovationCostEur !== null || input.transferCostsEur !== null) {
    righe.push("", "Costi stimati oltre il prezzo:");
    if (input.renovationCostEur !== null) {
      righe.push(`· ristrutturazione e sanatoria ${soldi(input.renovationCostEur)}`);
    }
    if (input.transferCostsEur !== null) {
      righe.push(`· imposte e spese di trasferimento ${soldi(input.transferCostsEur)}`);
    }
    righe.push(`Capitale complessivo stimato: ${soldi(roi.totalInvestedEur)}.`);
  }

  if (roi.flipRoiPct !== null) {
    righe.push(
      "",
      `Rivendita a lavori conclusi: ${soldi(input.marketValueEur!)} — margine potenziale ${roi.flipRoiPct}%.`
    );
  }
  if (roi.grossYieldPct !== null) {
    righe.push(
      `Locazione: ${soldi(input.monthlyRentEur!)} al mese, rendimento lordo ${roi.grossYieldPct}% annuo.`
    );
  }

  righe.push(
    "",
    "Stime lorde: non comprendono interessi su finanziamenti, tempi di aggiudicazione e di cantiere, costi di gestione, sfitto né imposte sulla plusvalenza.",
    "",
    `Documentazione completa su richiesta. — ${input.agencyName}`,
    "",
    "---",
    AI_DISCLAIMER_SHORT
  );

  return righe.join("\n");
}
