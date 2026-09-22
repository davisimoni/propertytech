/**
 * La checklist di conformità: voci, stati e verdetto.
 *
 * # Perché un modulo e non tre copie
 *
 * Le stesse voci servono in tre posti che devono per forza concordare: la
 * schermata dove l'agente compila, il PDF che porta al proprietario e la
 * rotta che salva. Se il PDF dicesse "pronto per la proposta" mentre la
 * schermata dice "non raccogliere ancora", a valere sarebbe il documento
 * stampato, che è quello che esce dall'agenzia.
 *
 * Modulo puro, senza `server-only` e senza database: il PDF si genera nel
 * browser (vedi `components/shared/download-pdf-button.tsx`), quindi queste
 * regole devono poter girare da entrambe le parti.
 *
 * # Cosa questo strumento NON è
 *
 * Non certifica niente. La conformità la attesta un tecnico, la provenienza la
 * verifica il notaio. Venderla come certificazione esporrebbe l'agenzia
 * esattamente al rischio che serve a evitare, ed è la stessa ragione per cui
 * il Fascicolo documentale non è annunciato come antiriciclaggio (CLAUDE.md §3).
 */

export type Stato = "ok" | "manca" | "verificare";
export type Peso = "bloccante" | "rilevante" | "informativo";

export interface Voce {
  id: string;
  gruppo: string;
  titolo: string;
  peso: Peso;
  /** Cosa comporta se manca: è la riga che fa capire perché vale la pena. */
  conseguenza: string;
  /** A chi si chiede, quando manca. */
  richiestaA: string;
}

export const VOCI: Voce[] = [
  {
    id: "visura",
    gruppo: "Titolarità",
    titolo: "Visura catastale aggiornata",
    peso: "bloccante",
    conseguenza: "Senza, non sai chi sono davvero gli intestatari né in che quote.",
    richiestaA: "Visura catastale aggiornata (o la carichi in Analisi Documenti)",
  },
  {
    id: "provenienza",
    gruppo: "Titolarità",
    titolo: "Atto di provenienza",
    peso: "bloccante",
    conseguenza:
      "Il notaio lo chiede sempre. Se è una successione, servono anche accettazione e trascrizione.",
    richiestaA: "Atto di acquisto o dichiarazione di successione",
  },
  {
    id: "formalita",
    gruppo: "Titolarità",
    titolo: "Ipoteche e formalità pregiudizievoli",
    peso: "bloccante",
    conseguenza:
      "Un'ipoteca non cancellata blocca il rogito o va estinta al saldo: va saputo prima di trattare.",
    richiestaA: "Ispezione ipotecaria aggiornata",
  },
  {
    id: "planimetria",
    gruppo: "Urbanistica",
    titolo: "Planimetria catastale conforme allo stato dei luoghi",
    peso: "bloccante",
    conseguenza:
      "La difformità catastale rende nullo l'atto se non sanata: sistemarla richiede settimane.",
    richiestaA: "Planimetria catastale e sopralluogo di un tecnico per il confronto",
  },
  {
    id: "titolo-edilizio",
    gruppo: "Urbanistica",
    titolo: "Titolo edilizio o condono",
    peso: "bloccante",
    conseguenza: "Serve la menzione in atto. Su un abuso non sanato la vendita non si fa.",
    richiestaA: "Licenza, concessione, permesso di costruire, SCIA o pratica di condono",
  },
  {
    id: "agibilita",
    gruppo: "Urbanistica",
    titolo: "Agibilità",
    peso: "rilevante",
    conseguenza: "Non blocca sempre la vendita, ma va dichiarata: l'acquirente con mutuo la chiede.",
    richiestaA: "Certificato di agibilità o abitabilità",
  },
  {
    id: "ape",
    gruppo: "Impianti ed energia",
    titolo: "APE in corso di validità",
    peso: "bloccante",
    conseguenza: "Obbligatorio già in annuncio: la classe energetica va indicata nella pubblicità.",
    richiestaA: "Attestato di Prestazione Energetica (dura 10 anni, se non sono cambiati gli impianti)",
  },
  {
    id: "impianti",
    gruppo: "Impianti ed energia",
    titolo: "Dichiarazione di conformità degli impianti",
    peso: "rilevante",
    conseguenza: "Se manca, in atto si dichiara l'assenza: è una leva di sconto per chi compra.",
    richiestaA: "Dichiarazioni di conformità o rispondenza di elettrico e termico",
  },
  {
    id: "caldaia",
    gruppo: "Impianti ed energia",
    titolo: "Libretto di impianto e revisione caldaia",
    peso: "informativo",
    conseguenza: "Un dettaglio che però il perito della banca guarda.",
    richiestaA: "Libretto di impianto con l'ultimo controllo",
  },
  {
    id: "millesimi",
    gruppo: "Condominio",
    titolo: "Spese condominiali e tabelle millesimali",
    peso: "rilevante",
    conseguenza: "Le spese dell'ultimo biennio seguono l'immobile: scoprirle dopo crea contenziosi.",
    richiestaA: "Ultimo consuntivo, preventivo e tabelle millesimali",
  },
  {
    id: "lavori",
    gruppo: "Condominio",
    titolo: "Delibere per lavori straordinari",
    peso: "rilevante",
    conseguenza: "Una facciata deliberata e non pagata cambia il prezzo della trattativa.",
    richiestaA: "Verbali delle ultime assemblee e dichiarazione dell'amministratore",
  },
  {
    id: "vincoli",
    gruppo: "Vincoli e diritti di terzi",
    titolo: "Prelazioni, usufrutto, servitù, locazioni in corso",
    peso: "bloccante",
    conseguenza:
      "Un inquilino con contratto in corso o una prelazione agraria cambiano tutto il percorso.",
    richiestaA: "Contratti in essere e dichiarazione del proprietario sui diritti di terzi",
  },
];

export const ETICHETTA_PESO: Record<Peso, string> = {
  bloccante: "Blocca il rogito",
  rilevante: "Pesa sulla trattativa",
  informativo: "Utile da avere",
};

export const ETICHETTA_STATO: Record<Stato, string> = {
  ok: "C'è",
  manca: "Manca",
  verificare: "Da chiedere",
};

export const STATI: { id: Stato; label: string }[] = [
  { id: "ok", label: ETICHETTA_STATO.ok },
  { id: "manca", label: ETICHETTA_STATO.manca },
  { id: "verificare", label: ETICHETTA_STATO.verificare },
];

export type MappaStati = Record<string, Stato>;
export type MappaNote = Record<string, string>;

export function isStato(valore: unknown): valore is Stato {
  return valore === "ok" || valore === "manca" || valore === "verificare";
}

/**
 * Lo stato di una voce mai toccata è "da chiedere", non "a posto".
 *
 * Il default prudente è l'unico difendibile: una checklist appena aperta non
 * ha verificato niente, e mostrarla tutta verde direbbe il contrario proprio a
 * chi la usa per decidere se raccogliere una proposta.
 */
export function statoDi(stati: MappaStati, id: string): Stato {
  return stati[id] ?? "verificare";
}

/**
 * Scarta le chiavi che non corrispondono a nessuna voce.
 *
 * Serve in lettura, non in scrittura: le voci cambiano quando cambia la
 * prassi, e una voce tolta oggi e rimessa domani deve ritrovare il proprio
 * stato invece di essere stata cancellata dal salvataggio successivo.
 */
export function soloVociNote(stati: unknown): MappaStati {
  if (!stati || typeof stati !== "object") return {};

  const validi: MappaStati = {};
  for (const voce of VOCI) {
    const valore = (stati as Record<string, unknown>)[voce.id];
    if (isStato(valore)) validi[voce.id] = valore;
  }
  return validi;
}

export function soloNoteNote(note: unknown): MappaNote {
  if (!note || typeof note !== "object") return {};

  const valide: MappaNote = {};
  for (const voce of VOCI) {
    const valore = (note as Record<string, unknown>)[voce.id];
    if (typeof valore === "string" && valore.trim()) valide[voce.id] = valore.trim();
  }
  return valide;
}

export interface Verdetto {
  tono: "blocco" | "attesa" | "ok";
  titolo: string;
  testo: string;
}

export function calcolaVerdetto(stati: MappaStati): Verdetto {
  const bloccantiMancanti = VOCI.filter(
    (v) => v.peso === "bloccante" && statoDi(stati, v.id) === "manca"
  );
  const bloccantiAperti = VOCI.filter(
    (v) => v.peso === "bloccante" && statoDi(stati, v.id) === "verificare"
  );
  const rilevantiAperti = VOCI.filter(
    (v) => v.peso === "rilevante" && statoDi(stati, v.id) !== "ok"
  );

  if (bloccantiMancanti.length > 0) {
    const uno = bloccantiMancanti.length === 1;
    return {
      tono: "blocco",
      titolo: "Non raccogliere ancora la proposta",
      testo: `Mancano ${bloccantiMancanti.length} document${uno ? "o" : "i"} che al rogito serv${uno ? "e" : "ono"} per forza. Procurateli prima: recuperarli con la proposta firmata significa rinviare, e a volte perdere l'acquirente.`,
    };
  }
  if (bloccantiAperti.length > 0) {
    const uno = bloccantiAperti.length === 1;
    return {
      tono: "attesa",
      titolo: "Da verificare prima della proposta",
      testo: `Ci sono ${bloccantiAperti.length} punt${uno ? "o" : "i"} ancora da controllare fra quelli che possono fermare il rogito. Una telefonata al proprietario adesso vale sei settimane dopo.`,
    };
  }
  if (rilevantiAperti.length > 0) {
    return {
      tono: "attesa",
      titolo: "Vendibile, con punti aperti",
      testo:
        "Niente che blocchi il rogito. Restano voci che pesano sulla trattativa: se non le chiarisci tu, le userà l'acquirente per trattare sul prezzo.",
    };
  }
  return {
    tono: "ok",
    titolo: "Pronto per la proposta",
    testo:
      "Le voci che fermano un rogito risultano tutte a posto. Resta la verifica del notaio, che nessuna checklist sostituisce.",
  };
}

export interface IndiceVendibilita {
  /** Voci a posto sul totale previsto, in percentuale intera. */
  percentuale: number;
  aPosto: number;
  totale: number;
  bloccantiAperti: number;
  /** Le voci non ancora a posto, ordinate per peso: sono i punti critici. */
  critiche: Voce[];
}

/**
 * L'indice di vendibilità **documentale**, e niente di più.
 *
 * È la quota di voci risultate a posto sul totale previsto: un conto
 * verificabile riga per riga, non una stima di mercato. Un numero che sembra
 * dire "questa casa si vende al 78%" sarebbe una previsione commerciale
 * travestita da misura, e finirebbe in mano a un proprietario che la legge
 * come una promessa.
 *
 * Le voci bloccanti sono contate a parte proprio perché la percentuale da sola
 * inganna: undici voci su dodici a posto fa 92%, ma se la dodicesima è un
 * abuso edilizio non sanato quel rogito non si fa.
 */
export function calcolaIndice(stati: MappaStati): IndiceVendibilita {
  const aPosto = VOCI.filter((v) => statoDi(stati, v.id) === "ok");
  const critiche = VOCI.filter((v) => statoDi(stati, v.id) !== "ok").sort((a, b) => {
    const ordine: Record<Peso, number> = { bloccante: 0, rilevante: 1, informativo: 2 };
    return ordine[a.peso] - ordine[b.peso];
  });

  return {
    percentuale: Math.round((aPosto.length / VOCI.length) * 100),
    aPosto: aPosto.length,
    totale: VOCI.length,
    bloccantiAperti: VOCI.filter(
      (v) => v.peso === "bloccante" && statoDi(stati, v.id) !== "ok"
    ).length,
    critiche,
  };
}

/** L'elenco da mandare al proprietario, in testo semplice. */
export function testoRichiesta(stati: MappaStati, immobile: string): string {
  const intestazione = immobile.trim()
    ? `Documenti da recuperare per ${immobile.trim()}:`
    : "Documenti da recuperare:";

  const righe = VOCI.filter((v) => statoDi(stati, v.id) !== "ok").map(
    (v) => `- ${v.richiestaA}${statoDi(stati, v.id) === "manca" ? " (risulta mancante)" : ""}`
  );

  return [intestazione, ...righe].join("\n");
}
