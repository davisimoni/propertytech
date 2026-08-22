import "server-only";
import { Prisma, type Organization } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Generazione del codice referral pubblico ("PROP-XXXXXX").
 *
 * Alfabeto senza 0/O/1/I: un codice condiviso a voce o su un cartello finisce
 * per essere riletto da qualcuno, e quei quattro caratteri sono la fonte più
 * comune di errore di trascrizione.
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;

function randomReferralCode(): string {
  let suffix = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `PROP-${suffix}`;
}

function isReferralCodeCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    ((error.meta?.target as string[] | undefined)?.includes("referralCode") ?? false)
  );
}

/**
 * Crea un'organizzazione con un `referralCode` univoco, ritentando in caso di
 * collisione. Con questo alfabeto la probabilità è bassissima ma non nulla, e
 * un secondo tentativo silenzioso è più semplice che dimensionare l'alfabeto
 * per un'improbabilità assoluta.
 *
 * `buildData` riceve il codice candidato: lo incorpora nel resto dei dati di
 * creazione (utente OWNER, subscription trial, ecc.), che restano a carico
 * del chiamante — questa funzione sa solo generare e ritentare.
 */
export async function createOrganizationWithReferralCode(
  buildData: (referralCode: string) => Prisma.OrganizationCreateInput
): Promise<Organization> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.organization.create({ data: buildData(randomReferralCode()) });
    } catch (error) {
      if (!isReferralCodeCollision(error) || attempt === MAX_ATTEMPTS) throw error;
    }
  }
  // Irraggiungibile: il ciclo sopra o ritorna o lancia entro MAX_ATTEMPTS.
  throw new Error("Impossibile generare un referralCode univoco.");
}

/** Assegna un referralCode a un'organizzazione che ne è priva, con lo stesso retry. */
export async function assignReferralCode(organizationId: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const referralCode = randomReferralCode();
    try {
      await prisma.organization.update({ where: { id: organizationId }, data: { referralCode } });
      return referralCode;
    } catch (error) {
      if (!isReferralCodeCollision(error) || attempt === MAX_ATTEMPTS) throw error;
    }
  }
  throw new Error("Impossibile generare un referralCode univoco.");
}
