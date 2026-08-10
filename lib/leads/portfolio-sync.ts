import "server-only";
import { prisma } from "@/lib/prisma";
import type { DocumentExtractionResult } from "@/lib/ai/document-schema";
import { deriveSellerCategory, MAX_OWNED_PROPERTIES } from "@/lib/whatsapp/portfolio";

/**
 * Incrocio fra il Modulo 2 (OCR visure) e il Modulo 1 (lead WhatsApp).
 *
 * Quando l'agenzia carica una visura, gli intestatari che compaiono nel
 * documento vengono confrontati con i lead già in pipeline. Il risultato NON è
 * una fusione dei dati ma una *proposta* (`PortfolioMatch` in stato PENDING):
 * l'omonimia in Italia è tutt'altro che rara, e attribuire d'ufficio un
 * immobile a un contatto che non ne è il proprietario significherebbe trattare
 * un dato personale errato e mandare l'agente a proporre la vendita di una casa
 * altrui. Il sistema propone, l'agente conferma.
 */

/** Tetto alla scansione dei lead: una singola estrazione non deve mai leggere
 *  l'intera pipeline di un'agenzia con anni di storico alle spalle. */
const MAX_LEADS_SCANNED = 2000;

/**
 * Riduce un nome alla sua forma confrontabile: niente accenti, punteggiatura o
 * doppi spazi, e token ordinati alfabeticamente.
 *
 * L'ordinamento dei token è la parte che conta davvero: le visure catastali
 * riportano l'intestatario come "ROSSI MARIO", mentre il lead arriva dal
 * portale come "Mario Rossi". Confrontando le stringhe così come sono, la
 * stessa persona non verrebbe mai riconosciuta.
 */
function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    // NFD separa la lettera dal segno diacritico, che qui viene scartato:
    // "Nicolò" e "Nicolo" devono combaciare.
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * Identità catastale dell'immobile, usata per non riproporre due volte lo
 * stesso bene se la stessa visura viene ricaricata.
 *
 * Servono almeno comune, foglio e particella: con meno dati l'immobile non è
 * identificabile e si preferisce non proporre nulla piuttosto che chiedere
 * all'agente di validare una corrispondenza su una chiave ambigua.
 */
function buildPropertyKey(data: DocumentExtractionResult["datiImmobile"]): string | null {
  const comune = data.comune?.trim().toLowerCase();
  const foglio = data.foglio?.trim().toLowerCase();
  const particella = data.particella?.trim().toLowerCase();
  const subalterno = data.subalterno?.trim().toLowerCase() ?? "";

  if (!comune || !foglio || !particella) return null;

  return [comune, foglio, particella, subalterno].join("|");
}

/**
 * Registra le corrispondenze proposte fra il documento appena estratto e i lead
 * in pipeline. Restituisce quante proposte sono state create.
 *
 * Nessun conteggio viene toccato qui: `ownedPropertiesCount` cambia solo quando
 * l'agente conferma il match (vedi `confirmPortfolioMatch`).
 *
 * Il chiamante deve trattarla come operazione accessoria: un errore qui non
 * deve mai far fallire l'estrazione, che è ciò per cui l'agenzia ha speso un
 * credito.
 */
export async function syncPortfolioFromExtraction(
  organizationId: string,
  extraction: DocumentExtractionResult
): Promise<number> {
  const propertyKey = buildPropertyKey(extraction.datiImmobile);
  if (!propertyKey) return 0;

  // Un solo token (una sola parola) non basta a identificare una persona:
  // "rossi" combacerebbe con chiunque si chiami Rossi.
  const owners = extraction.proprietari
    .map((owner) => ({ ...owner, key: normalizeName(owner.nomeCognome) }))
    .filter((owner) => owner.key.includes(" "));

  if (owners.length === 0) return 0;

  const ownersByKey = new Map(owners.map((owner) => [owner.key, owner]));

  // Il filtro su organizationId è nella query, non a valle: nessuna visura di
  // un'agenzia può toccare i lead di un'altra (CLAUDE.md §5).
  //
  // Il confronto avviene in memoria perché la normalizzazione dei nomi non è
  // esprimibile in SQL senza una colonna dedicata; il `take` tiene comunque
  // limitata la lettura, dando la precedenza ai lead più recenti — quelli su
  // cui l'agenzia sta effettivamente lavorando.
  const leads = await prisma.lead.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
    take: MAX_LEADS_SCANNED,
    select: { id: true, clientName: true },
  });

  const { datiImmobile } = extraction;
  let created = 0;

  for (const lead of leads) {
    const owner = ownersByKey.get(normalizeName(lead.clientName));
    if (!owner) continue;

    // `createMany` + `skipDuplicates` si appoggia al vincolo unico
    // [leadId, propertyKey]: ricaricare la stessa visura non riapre una
    // decisione che l'agente ha già preso, né confermata né ignorata.
    const result = await prisma.portfolioMatch.createMany({
      data: [
        {
          leadId: lead.id,
          organizationId,
          propertyKey,
          comune: datiImmobile.comune,
          foglio: datiImmobile.foglio,
          particella: datiImmobile.particella,
          subalterno: datiImmobile.subalterno,
          categoriaCatastale: datiImmobile.categoriaCatastale,
          ownerName: owner.nomeCognome,
          quotaProprieta: owner.quotaProprieta,
        },
      ],
      skipDuplicates: true,
    });

    created += result.count;
  }

  return created;
}

/**
 * Applica un match confermato dall'agente: l'immobile entra nel conteggio.
 *
 * L'incremento avviene qui e solo qui, perché è l'unico punto in cui una
 * persona ha davvero verificato che intestatario e contatto coincidano.
 */
export async function confirmPortfolioMatch(
  organizationId: string,
  matchId: string
): Promise<{ leadId: string; ownedPropertiesCount: number } | null> {
  const match = await prisma.portfolioMatch.findFirst({
    where: { id: matchId, organizationId, status: "PENDING" },
    select: { id: true, leadId: true, lead: { select: { ownedPropertiesCount: true } } },
  });

  if (!match) return null;

  const count = Math.min((match.lead.ownedPropertiesCount ?? 0) + 1, MAX_OWNED_PROPERTIES);

  // Transazione: conteggio del lead e stato del match devono muoversi insieme,
  // altrimenti un'interruzione a metà lascerebbe un match confermato che non ha
  // mai inciso sul portafoglio, o un immobile contato due volte al retry.
  await prisma.$transaction([
    prisma.lead.update({
      where: { id: match.leadId },
      data: { ownedPropertiesCount: count, sellerCategory: deriveSellerCategory(count) },
    }),
    prisma.portfolioMatch.update({
      where: { id: match.id },
      data: { status: "CONFIRMED", resolvedAt: new Date() },
    }),
  ]);

  return { leadId: match.leadId, ownedPropertiesCount: count };
}

/**
 * Archivia un match come omonimia. Il conteggio resta intatto e la proposta non
 * verrà più riaperta: l'agente ha già stabilito che sono due persone diverse.
 */
export async function ignorePortfolioMatch(
  organizationId: string,
  matchId: string
): Promise<boolean> {
  const result = await prisma.portfolioMatch.updateMany({
    where: { id: matchId, organizationId, status: "PENDING" },
    data: { status: "IGNORED", resolvedAt: new Date() },
  });

  return result.count > 0;
}

/** Esportate per i test: la normalizzazione è la parte fragile dell'incrocio. */
export const __testables = { normalizeName, buildPropertyKey };
