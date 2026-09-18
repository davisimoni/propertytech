import type { PlanId } from "@/lib/plans";

/**
 * I bonus inclusi nei piani a pagamento.
 *
 * # Cosa sono, e cosa non sono
 *
 * Sono strumenti che risolvono colli di bottiglia dell'acquisizione, la parte
 * del lavoro che i moduli principali non tocca: cosa rispondere a un
 * proprietario che contesta la provvigione, cosa lasciargli in mano dopo la
 * valutazione, cosa controllare prima di raccogliere una proposta. Non
 * consumano crediti e non chiamano modelli: girano nel browser con i dati che
 * l'agente scrive, e per questo restano disponibili anche a crediti esauriti.
 *
 * # Perché l'elenco sta qui
 *
 * Perché lo leggono in tre posti — il listino pubblico, la griglia dei piani
 * in impostazioni e l'area riservata — e tre copie a mano divergono al primo
 * ritocco, lasciando promesso in pagina un bonus che dentro non c'è.
 *
 * # Come sono cumulati
 *
 * Ogni piano include i bonus dei piani inferiori: `bonusDisponibili` risolve
 * la catena, così nessuna schermata deve ricordarsi che l'Enterprise ha anche
 * quelli dello Starter.
 */

export type BonusId = "script-obiezioni" | "report-valorizzazione" | "audit-conformita";

export interface Bonus {
  id: BonusId;
  /** Piano che lo sblocca. */
  plan: Exclude<PlanId, "trial">;
  name: string;
  /** Una riga: è quella che compare nel badge del listino. */
  tagline: string;
  /** Cosa risolve, in due righe, per la scheda nell'area riservata. */
  description: string;
  /** Il problema concreto che l'agente riconosce. */
  problem: string;
  href: string;
  /** Etichetta del pulsante quando il bonus è accessibile. */
  action: string;
}

export const BONUSES: Bonus[] = [
  {
    id: "script-obiezioni",
    plan: "starter",
    name: "Kit Script WhatsApp e Obiezioni",
    tagline: "Risposte pronte alle obiezioni sull'incarico",
    description:
      "Le risposte alle obiezioni che fanno saltare un incarico, pronte da copiare in chat, e il calcolo della provvigione da mostrare al proprietario mentre gliene parli.",
    problem: "Il proprietario dice che la provvigione è alta e la trattativa si ferma lì.",
    href: "/bonuses/script-obiezioni",
    action: "Apri il kit",
  },
  {
    id: "report-valorizzazione",
    plan: "pro",
    name: "Report di Valorizzazione Immobile",
    tagline: "Il PDF con il tuo logo da lasciare al proprietario",
    description:
      "Genera in un minuto il documento di valorizzazione con il logo dell'agenzia: prezzo consigliato, interventi che alzano il valore, piano di promozione. È quello che si lascia in mano al proprietario alla fine della valutazione.",
    problem: "Esci dalla valutazione senza lasciare niente di scritto, e la sera decide un altro.",
    href: "/bonuses/report-valorizzazione",
    action: "Crea il report",
  },
  {
    id: "audit-conformita",
    plan: "enterprise",
    name: "Checklist e Audit Conformità",
    tagline: "Verifica se l'immobile è vendibile prima della proposta",
    description:
      "La verifica dei documenti dell'immobile prima di raccogliere una proposta: cosa c'è, cosa manca, cosa blocca il rogito. Con l'elenco delle cose da chiedere al proprietario, da stampare o inviare.",
    problem: "Scopri la difformità catastale dal notaio, con la proposta già firmata.",
    href: "/bonuses/audit-conformita",
    action: "Apri la checklist",
  },
];

/** Ordine dei piani, per stabilire cosa è incluso e cosa è sopra. */
const ORDINE: PlanId[] = ["trial", "starter", "pro", "enterprise"];

function livello(plan: PlanId): number {
  return ORDINE.indexOf(plan);
}

/** I bonus inclusi in un piano, cumulando quelli dei piani inferiori. */
export function bonusDisponibili(plan: PlanId): Bonus[] {
  return BONUSES.filter((bonus) => livello(plan) >= livello(bonus.plan));
}

/** Vero se quel piano dà accesso a quel bonus. */
export function bonusAccessibile(plan: PlanId, bonusId: BonusId): boolean {
  return bonusDisponibili(plan).some((bonus) => bonus.id === bonusId);
}

/**
 * Il bonus che il piano aggiunge rispetto a quello sotto.
 *
 * È quello che va nel badge del listino: dire "include anche i bonus
 * precedenti" è compito della riga sotto, non del badge, che deve restare
 * leggibile in una riga sola su un telefono.
 */
export function bonusDelPiano(plan: PlanId): Bonus | null {
  return BONUSES.find((bonus) => bonus.plan === plan) ?? null;
}
