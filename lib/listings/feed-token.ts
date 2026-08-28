import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Token del feed XML verso i portali immobiliari.
 *
 * Il feed non può essere protetto da sessione: a prelevarlo è il crawler di
 * Immobiliare.it o Idealista, che non ha un cookie e non può farne il login.
 * L'unica autenticazione praticabile su un feed pollato da una macchina terza
 * è un segreto nell'URL — che è anche il meccanismo che i portali stessi si
 * aspettano.
 *
 * Da qui discendono i due vincoli di questo modulo: il token dev'essere lungo
 * abbastanza da non essere indovinabile (24 byte casuali = 192 bit), e la
 * risoluzione dev'essere impossibile da ingannare con un valore vuoto.
 */

/** Stesso formato del segreto webhook CRM: riconoscibile a colpo d'occhio nei log. */
export function generateFeedToken(): string {
  return `ptf_${randomBytes(24).toString("hex")}`;
}

export interface FeedOrganization {
  id: string;
  agencyName: string;
  legalName: string | null;
}

/**
 * Risolve l'agenzia a partire dal token del feed.
 *
 * **Il controllo esplicito su stringa vuota non è ridondante.** Passando
 * `undefined` a un filtro Prisma, la clausola viene *ignorata*: una
 * `findFirst({ where: { listingFeedToken: undefined } })` non cerca le agenzie
 * senza token, le cerca tutte, e restituisce la prima riga della tabella. Su
 * una rotta pubblica significherebbe consegnare il portafoglio di un'agenzia a
 * qualunque chiamata priva di token. Filtrare qui — e restituire `null` prima
 * ancora di toccare il database — è ciò che rende la rotta fail-closed
 * (CLAUDE.md §5).
 */
export async function findOrganizationByFeedToken(
  token: string | null | undefined
): Promise<FeedOrganization | null> {
  if (typeof token !== "string") return null;

  const candidate = token.trim();
  if (!candidate) return null;

  return prisma.organization.findUnique({
    where: { listingFeedToken: candidate },
    select: { id: true, agencyName: true, legalName: true },
  });
}
