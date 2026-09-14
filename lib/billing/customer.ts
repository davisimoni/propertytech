import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/billing/stripe";

/**
 * Il cliente Stripe dell'agenzia, con recupero automatico se l'id è obsoleto.
 *
 * # Il problema che risolve
 *
 * `Subscription.stripeCustomerId` è un riferimento a un oggetto che vive su
 * Stripe, e i due possono divergere: un id creato in ambiente **test** non
 * esiste nell'account **live**, un cliente cancellato a mano dalla dashboard
 * non esiste più, e un account Stripe sostituito li invalida tutti in blocco.
 * In tutti questi casi Stripe risponde `No such customer` e il pagamento non
 * parte — con l'agenzia bloccata davanti a un errore che non può risolvere.
 *
 * # Perché al momento dell'errore e non prima
 *
 * Verificare l'esistenza del cliente prima di ogni pagamento costerebbe una
 * chiamata in più a ogni acquisto, per un caso che capita quasi mai. Qui si
 * prova, e **solo se** Stripe dice che quel cliente non c'è si azzera il
 * riferimento, se ne crea uno nuovo e si riprova una volta sola.
 *
 * Una volta sola, non in ciclo: se fallisce anche il secondo tentativo il
 * problema non è l'id obsoleto, e insistere nasconderebbe la causa vera.
 */

/** Riconosce l'errore "questo cliente non esiste" fra tutti gli altri. */
export function isClienteInesistente(error: unknown): boolean {
  const e = error as { code?: string; param?: string; message?: string };
  if (e?.code !== "resource_missing") return false;
  return e.param === "customer" || /No such customer/i.test(e.message ?? "");
}

/**
 * Id del cliente Stripe dell'agenzia, creandolo se non c'è.
 *
 * Il cliente si riusa fra un acquisto e l'altro: senza, ogni pagamento
 * creerebbe un'anagrafica nuova e la stessa agenzia comparirebbe su Stripe
 * come dieci clienti diversi, impossibili da riconciliare.
 */
async function ottieniOCreaCliente(organizationId: string): Promise<string> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { subscription: true },
  });

  if (!organization) throw new Error(`Organizzazione ${organizationId} inesistente`);

  const esistente = organization.subscription?.stripeCustomerId;
  if (esistente) return esistente;

  const stripe = getStripe();
  const cliente = await stripe.customers.create({
    email: organization.email,
    name: organization.agencyName,
    metadata: { organizationId },
  });

  await prisma.subscription.update({
    where: { organizationId },
    data: { stripeCustomerId: cliente.id },
  });

  return cliente.id;
}

/**
 * Esegue un'operazione Stripe che richiede il cliente dell'agenzia,
 * rigenerandolo se quello salvato non esiste più.
 *
 * `tentativo` arriva alla funzione perché chi usa una chiave di idempotenza
 * deve poterne costruire una diversa al secondo giro: riusare la stessa
 * farebbe restituire a Stripe la risposta memorizzata del primo tentativo,
 * cioè proprio l'errore da cui stiamo cercando di uscire.
 */
export async function conClienteValido<T>(
  organizationId: string,
  operazione: (customerId: string, tentativo: number) => Promise<T>
): Promise<T> {
  const customerId = await ottieniOCreaCliente(organizationId);

  try {
    return await operazione(customerId, 1);
  } catch (error) {
    if (!isClienteInesistente(error)) throw error;

    console.warn("[billing/customer] Cliente Stripe obsoleto: ne creo uno nuovo", {
      organizationId,
      // L'id vecchio serve a ricostruire cosa è successo e non è un segreto:
      // identifica un oggetto che su questo account non esiste più.
      customerIdObsoleto: customerId,
    });

    await prisma.subscription.update({
      where: { organizationId },
      data: { stripeCustomerId: null },
    });

    const nuovoCliente = await ottieniOCreaCliente(organizationId);
    return await operazione(nuovoCliente, 2);
  }
}

/** Solo per le rotte che devono sapere se un cliente esiste già, senza crearlo. */
export async function clienteSalvato(organizationId: string): Promise<string | null> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    select: { stripeCustomerId: true },
  });
  return subscription?.stripeCustomerId ?? null;
}

export type { Stripe };
