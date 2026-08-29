import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Riconosce a quale immobile del portafoglio si riferisce un lead.
 *
 * `Lead.propertyRef` è testo libero: la frase con cui la persona ha scritto su
 * WhatsApp, oppure il riferimento inserito dal portale. Qui si prova a
 * ricondurlo a una scheda vera.
 *
 * # La regola è volutamente severa
 *
 * Si collega **solo** su una corrispondenza inequivocabile: il codice di
 * riferimento dell'agenzia trovato per intero nel testo, come parola a sé.
 * Niente somiglianze, niente indirizzi, niente "il trilocale in centro".
 *
 * Il motivo è l'asimmetria degli errori. Un lead non collegato resta un lead
 * normale: l'agente lo apre e vede la frase originale, esattamente come oggi.
 * Un lead collegato all'immobile **sbagliato** invece inquina il bilancio che
 * mandiamo al proprietario — gli attribuisce visite che non ha ricevuto — e
 * fa comparire nella scheda di una casa persone che stavano guardando
 * tutt'altro. Nel dubbio non si collega.
 *
 * L'agente può sempre correggere a mano dalla scheda: quella resta la strada
 * per i casi che l'automatismo non prende.
 */

/** Riferimenti troppo corti sono ambigui: "A1" comparirebbe ovunque. */
const MIN_REFERENCE_LENGTH = 3;

/** Normalizza per il confronto: maiuscole, senza accenti e punteggiatura. */
function normalize(value: string): string {
  return value
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cerca il riferimento di un immobile dentro un testo libero.
 *
 * Restituisce l'id dell'immobile, o `null` se non c'è una corrispondenza
 * certa — compreso il caso in cui **due** immobili diversi corrispondano, che
 * è ambiguità e non un match.
 */
export async function resolvePropertyFromText(
  organizationId: string,
  text: string
): Promise<string | null> {
  const testo = normalize(text);
  if (!testo) return null;

  const immobili = await prisma.property.findMany({
    where: { organizationId },
    select: { id: true, reference: true },
    // Il portafoglio di un'agenzia sta ampiamente in questo limite, e la
    // ricerca avviene in memoria su stringhe già normalizzate: una query per
    // ogni possibile forma del riferimento sarebbe molto più cara.
    take: 1000,
  });

  const trovati = immobili.filter((immobile) => {
    const riferimento = normalize(immobile.reference);
    if (riferimento.length < MIN_REFERENCE_LENGTH) return false;

    // Confine di parola su entrambi i lati: "S0140" non deve corrispondere
    // dentro "S01400", e "VIA" non deve corrispondere dentro "VIALE".
    return new RegExp(`(^| )${escapeRegex(riferimento)}( |$)`).test(testo);
  });

  // Zero corrispondenze o più di una: in entrambi i casi non si collega.
  return trovati.length === 1 ? trovati[0]!.id : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Collega il lead a un immobile, se il riferimento lo consente.
 *
 * Non lancia e non sovrascrive un collegamento già presente: se l'agente lo ha
 * corretto a mano, quella scelta vale più di quella dell'automatismo.
 */
export async function linkLeadToProperty(lead: {
  id: string;
  organizationId: string;
  propertyRef: string;
  propertyId: string | null;
}): Promise<string | null> {
  if (lead.propertyId) return lead.propertyId;

  try {
    const propertyId = await resolvePropertyFromText(lead.organizationId, lead.propertyRef);
    if (!propertyId) return null;

    await prisma.lead.update({ where: { id: lead.id }, data: { propertyId } });

    console.info("[LEAD-PROPERTY-LINK]", { leadId: lead.id, propertyId });
    return propertyId;
  } catch (error) {
    // Non blocca nulla: il collegamento è un arricchimento, non una condizione
    // della qualificazione.
    console.error("[leads/resolve-property] Collegamento non riuscito", {
      leadId: lead.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
