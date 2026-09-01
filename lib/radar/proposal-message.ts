import { AI_DISCLAIMER_SHORT } from "@/lib/compliance";
import { formatPrice, PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";
import type { PropertyType, RadarKind } from "@prisma/client";
import { computeRoi } from "./roi";

/**
 * Testo della proposta inviata al cliente.
 *
 * # Perché è composto qui e non generato dal modello
 *
 * Un'agenzia deve poter sapere esattamente cosa è stato scritto a un suo
 * cliente. Un testo prodotto da un modello a ogni invio non dà quella
 * garanzia, e su un'asta giudiziaria — dove ogni parola può essere letta come
 * una promessa sulle condizioni del lotto — la differenza pesa. Qui il
 * messaggio è la stessa funzione per l'anteprima e per l'invio: quello che
 * l'agente legge prima di confermare è, byte per byte, quello che parte.
 *
 * # Perché un'asta non si annuncia come un'occasione
 *
 * Il messaggio dice che si tratta di una vendita giudiziaria e non riporta né
 * il semaforo di rischio né le difformità: sono valutazioni interne
 * all'agenzia, prodotte da una sintesi automatica, e trasformarle in
 * affermazioni verso un acquirente significherebbe rispondere di quelle
 * condizioni. Il lotto lo si presenta, la perizia la si commenta parlando.
 *
 * Forma di cortesia: qui parla l'agenzia a un suo contatto (CLAUDE.md §1).
 */
export interface ProposalInput {
  clientName: string;
  agencyName: string;
  kind: RadarKind;
  type: PropertyType;
  comune: string;
  zona: string | null;
  priceEur: number;
  squareMeters: number;
  auctionDate: Date | null;
  lotto: string | null;
}

export function buildRadarProposal(input: ProposalInput): string {
  const luogo = input.zona ? `${input.comune} (${input.zona})` : input.comune;
  const isAsta = input.kind === "ASTA";

  const righe = [
    `Buongiorno ${input.clientName}, le segnaliamo un immobile che potrebbe corrispondere alla sua ricerca:`,
    "",
    `${PROPERTY_TYPE_LABELS[input.type]} a ${luogo}`,
    `${input.squareMeters} mq · ${formatPrice(input.priceEur)}${isAsta ? " (offerta minima)" : ""}`,
  ];

  if (isAsta) {
    // Dichiarato subito e non in fondo: comprare all'asta significa niente
    // trattativa sul prezzo, tempi fissati dal tribunale e nessuna garanzia
    // per vizi. Chi legge deve saperlo prima di interessarsi, non dopo.
    righe.push(
      "",
      "Si tratta di una vendita giudiziaria: le condizioni di partecipazione e i termini sono stabiliti dal Tribunale."
    );

    if (input.auctionDate) {
      righe.push(
        `Data della vendita: ${input.auctionDate.toLocaleDateString("it-IT", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}.`
      );
    }
    if (input.lotto) righe.push(`Lotto ${input.lotto}.`);
  }

  righe.push(
    "",
    "Se le interessa, possiamo vedere insieme la documentazione e valutare se fa al caso suo: mi faccia sapere quando le è comodo sentirci.",
    "",
    `${input.agencyName}`,
    "",
    "---",
    AI_DISCLAIMER_SHORT
  );

  return righe.join("\n");
}

/**
 * Prospetto economico per un investitore.
 *
 * # Perché è un messaggio diverso dalla proposta
 *
 * Ha un destinatario diverso. La proposta parla a chi cerca casa e racconta
 * l'immobile; questo parla a chi cerca un rendimento e racconta i numeri.
 * Mandare l'uno a chi si aspettava l'altro è il modo più rapido di sembrare
 * fuori fuoco.
 *
 * # Perché dichiara cosa NON è nel conto
 *
 * Un rendimento lordo che ignora interessi, tempi di cantiere e sfitto è
 * ottimista esattamente di quelli. Chi riceve questo messaggio può muovere
 * capitale sulla base di un numero: se il numero è lordo deve leggerlo scritto,
 * non dedurlo.
 */
export interface RoiProposalInput extends ProposalInput {
  transferCostsEur: number | null;
  renovationCostEur: number | null;
  marketValueEur: number | null;
  monthlyRentEur: number | null;
}

export function buildRoiProspectus(input: RoiProposalInput): string {
  const roi = computeRoi({
    priceEur: input.priceEur,
    transferCostsEur: input.transferCostsEur,
    renovationCostEur: input.renovationCostEur,
    marketValueEur: input.marketValueEur,
    monthlyRentEur: input.monthlyRentEur,
  });

  const soldi = (v: number) => `${new Intl.NumberFormat("it-IT").format(v)} €`;
  const luogo = input.zona ? `${input.comune} (${input.zona})` : input.comune;

  const righe = [
    `Buongiorno ${input.clientName}, le sottopongo un'operazione che potrebbe interessarla:`,
    "",
    `${PROPERTY_TYPE_LABELS[input.type]} a ${luogo} — ${input.squareMeters} mq`,
    `${input.kind === "ASTA" ? "Offerta minima" : "Prezzo"}: ${soldi(input.priceEur)}`,
  ];

  if (input.renovationCostEur !== null) {
    righe.push(`Ristrutturazione e sanatoria stimate: ${soldi(input.renovationCostEur)}`);
  }
  if (input.transferCostsEur !== null) {
    righe.push(`Imposte e spese di trasferimento: ${soldi(input.transferCostsEur)}`);
  }

  righe.push("", `Capitale complessivo stimato: ${soldi(roi.totalInvestedEur)}`);

  if (roi.flipRoiPct !== null && input.marketValueEur !== null) {
    righe.push(
      `Valore di mercato a lavori conclusi: ${soldi(input.marketValueEur)}`,
      `Margine potenziale: ${soldi(roi.flipMarginEur ?? 0)} (${roi.flipRoiPct}%)`
    );
  }
  if (roi.grossYieldPct !== null && input.monthlyRentEur !== null) {
    righe.push(
      `Canone atteso: ${soldi(input.monthlyRentEur)} al mese — rendimento lordo ${roi.grossYieldPct}% annuo`
    );
  }

  if (input.kind === "ASTA") {
    righe.push(
      "",
      "Si tratta di una vendita giudiziaria: condizioni e termini sono stabiliti dal Tribunale."
    );
  }

  righe.push(
    "",
    "Sono stime lorde: non comprendono interessi su eventuali finanziamenti, tempi di aggiudicazione e di cantiere, costi di gestione, sfitto né imposte sulla plusvalenza.",
    "",
    "Se l'operazione la interessa, vediamo insieme la documentazione e i conti nel dettaglio.",
    "",
    `${input.agencyName}`,
    "",
    "---",
    AI_DISCLAIMER_SHORT
  );

  return righe.join("\n");
}
