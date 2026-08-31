import { AI_DISCLAIMER_SHORT } from "@/lib/compliance";
import { formatPrice, PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";
import type { PropertyType, RadarKind } from "@prisma/client";

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
