import type { OccupancyStatus, RiskLevel } from "@prisma/client";

/**
 * Semaforo di rischio di un lotto all'asta.
 *
 * # Perché è codice e non una risposta del modello
 *
 * Un colore su una schermata è un giudizio, e su un lotto all'asta è il
 * giudizio da cui dipende una decisione da centinaia di migliaia di euro. Se
 * lo esprimesse il modello, l'agenzia che compra su un "verde" e trova
 * un'occupazione senza titolo avrebbe come unica spiegazione «l'ha detto
 * l'intelligenza artificiale» — e la nostra schermata come prova.
 *
 * Qui il modello fa una cosa sola: dire cosa c'è scritto nella perizia. Il
 * colore lo decidono queste regole, che sono poche, dichiarate, e vengono
 * mostrate accanto al semaforo. L'agente vede *perché* è rosso, non solo che
 * lo è, e può non essere d'accordo con un criterio invece di dover litigare
 * con un oracolo.
 *
 * # Perché nel dubbio è giallo e non verde
 *
 * Il verde richiede prove positive: nessun vincolo, nessuna difformità,
 * occupazione accertata come libera. Una perizia che non dice nulla su un
 * punto non è una perizia che dice "va tutto bene" — spessissimo significa
 * che quella verifica non è stata fatta. Partire dal verde trasformerebbe
 * ogni silenzio in una rassicurazione.
 */

/** Soglia oltre la quale il costo di sanatoria pesa sulla convenienza. */
export const REMEDIATION_WARNING_RATIO = 0.1;

export interface RiskInput {
  occupancy: OccupancyStatus;
  irregularities: string[];
  encumbrances: string[];
  /** Estremo alto della stima di sanatoria, il più prudente dei due. */
  remediationCostMaxEur: number | null;
  /** Base d'asta o valore di perizia, per rapportare il costo. */
  basePriceEur: number | null;
}

export interface RiskVerdict {
  risk: RiskLevel;
  /** I criteri che hanno prodotto il colore, in ordine di gravità. */
  reasons: string[];
}

/**
 * Applica i criteri e restituisce colore e motivazioni.
 *
 * Funzione pura: nessuna lettura da database, nessuna chiamata di rete. È il
 * pezzo che vale la pena poter verificare riga per riga, ed è anche quello che
 * finirà davanti a un cliente che chiede conto di una valutazione.
 */
export function evaluateRisk(input: RiskInput): RiskVerdict {
  const reasons: string[] = [];
  let rosso = false;
  let giallo = false;

  // --- Occupazione ---------------------------------------------------------
  if (input.occupancy === "OCCUPATO_SENZA_TITOLO") {
    rosso = true;
    reasons.push(
      "Immobile occupato senza titolo: il rilascio richiede un procedimento di sgombero, con tempi e costi non prevedibili."
    );
  } else if (input.occupancy === "OCCUPATO_CON_TITOLO") {
    giallo = true;
    reasons.push(
      "Immobile occupato con titolo opponibile: la disponibilità dipende dalla scadenza del contratto in essere."
    );
  } else if (input.occupancy === "NON_DETERMINATO") {
    giallo = true;
    reasons.push(
      "Stato occupazionale non determinato dalla perizia: da verificare prima di formulare un'offerta."
    );
  }

  // --- Difformità edilizie -------------------------------------------------
  //
  // La perizia distingue di rado "sanabile" da "non sanabile" con parole
  // nostre: si cerca la negazione esplicita, perche' e' l'unico segnale
  // affidabile. Nel dubbio la difformita' resta gialla, non rossa: chiamare
  // rosso ogni rilievo renderebbe il semaforo inutile, visto che quasi ogni
  // perizia ne contiene almeno uno.
  const nonSanabile = input.irregularities.some((voce) =>
    /non\s+sanabil|insanabil|non\s+regolarizzabil/i.test(voce)
  );

  if (nonSanabile) {
    rosso = true;
    reasons.push("La perizia indica almeno una difformità dichiarata non sanabile.");
  } else if (input.irregularities.length > 0) {
    giallo = true;
    reasons.push(
      `Rilevate ${input.irregularities.length} difformità edilizie o urbanistiche da sanare.`
    );
  }

  // --- Vincoli e gravami ---------------------------------------------------
  if (input.encumbrances.length > 0) {
    giallo = true;
    reasons.push(
      `Presenti ${input.encumbrances.length} fra vincoli, gravami o diritti di terzi segnalati in perizia.`
    );
  }

  // --- Costo di sanatoria rispetto alla base -------------------------------
  const { remediationCostMaxEur, basePriceEur } = input;
  if (remediationCostMaxEur !== null && basePriceEur !== null && basePriceEur > 0) {
    const quota = remediationCostMaxEur / basePriceEur;
    if (quota > REMEDIATION_WARNING_RATIO) {
      giallo = true;
      reasons.push(
        `Costo stimato di sanatoria pari al ${Math.round(quota * 100)}% della base: incide in modo sensibile sulla convenienza.`
      );
    }
  }

  if (rosso) return { risk: "ROSSO", reasons };
  if (giallo) return { risk: "GIALLO", reasons };

  return {
    risk: "VERDE",
    reasons: [
      "Nessuna criticità rilevata dalla perizia: immobile risultante libero, senza difformità né vincoli segnalati.",
    ],
  };
}

/** Etichette e stile del semaforo, in un posto solo. */
export const RISK_LABELS: Record<RiskLevel, string> = {
  VERDE: "Rischio basso",
  GIALLO: "Da verificare",
  ROSSO: "Rischio alto",
};

export const RISK_CLASSES: Record<RiskLevel, string> = {
  VERDE: "bg-status-qualified/10 text-status-qualified",
  GIALLO: "bg-status-pending/10 text-status-pending",
  ROSSO: "bg-status-blocked/10 text-status-blocked",
};

export const OCCUPANCY_LABELS: Record<OccupancyStatus, string> = {
  LIBERO: "Libero",
  OCCUPATO_CON_TITOLO: "Occupato con titolo",
  OCCUPATO_SENZA_TITOLO: "Occupato senza titolo",
  NON_DETERMINATO: "Non determinato",
};
