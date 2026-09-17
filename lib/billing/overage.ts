import "server-only";
import type Stripe from "stripe";
import type { MeteredUsageEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasMeteredOverage, PLANS, type PlanId } from "@/lib/plans";
import {
  getEnterpriseOveragePriceId,
  getStripe,
  isStripeEnabled,
  WHATSAPP_OVERAGE_METER_EVENT,
  type PaidPlanId,
} from "@/lib/billing/stripe";
import { reportBillingError, reportWebhookError } from "@/lib/observability/report-error";

/**
 * Conversazioni WhatsApp oltre l'incluso Enterprise, addebitate a consumo.
 *
 * # Come funziona
 *
 * L'abbonamento Enterprise mensile porta una seconda voce, a consumo, legata
 * a un contatore Stripe (Billing Meter). Ogni conversazione che supera le
 * incluse diventa un evento inviato a quel contatore; Stripe le somma nel
 * periodo e le mette nella fattura del rinnovo. Noi non calcoliamo importi e
 * non emettiamo nulla: contiamo, e diciamo a Stripe quante.
 *
 * # Quando è attivo — fail-closed
 *
 * Solo se tutte queste cose sono vere insieme: piano Enterprise, Stripe
 * configurato, prezzo a consumo configurato, cliente Stripe noto, e la voce a
 * consumo **vista** sull'abbonamento dal webhook (`stripeOverageItemId`). Se
 * ne manca una, l'agenzia al limite si ferma come prima invece di consumare
 * senza che nessuno addebiti: è il caso dell'Enterprise annuale (vedi
 * `getOverageLineItem`) e degli account Enterprise assegnati a mano ai beta
 * tester, che un abbonamento Stripe non ce l'hanno.
 */

export interface OverageSubscriptionState {
  status: PlanId;
  stripeCustomerId: string | null;
  stripeOverageItemId: string | null;
}

export function isOverageBillingActive(
  subscription: OverageSubscriptionState | null | undefined
): boolean {
  return Boolean(
    subscription &&
      hasMeteredOverage(subscription.status) &&
      subscription.stripeCustomerId &&
      subscription.stripeOverageItemId &&
      isStripeEnabled() &&
      getEnterpriseOveragePriceId()
  );
}

/**
 * Quante unità di un consumo cadono oltre l'incluso.
 *
 * Lavora sul valore del contatore **dopo** l'incremento, che l'`update` di
 * Postgres restituisce già serializzato: due conversazioni concorrenti a
 * cavallo della soglia vedono ciascuna il proprio valore, e l'eccedenza non
 * si conta né zero né due volte.
 */
export function unitaOltreIncluso(usatiDopo: number, incluse: number, quantita: number): number {
  const eccedenza = usatiDopo - incluse;
  if (eccedenza <= 0 || quantita <= 0) return 0;
  return Math.min(quantita, eccedenza);
}

/** Oltre questa età un evento non si invia più: Stripe rifiuta timestamp più vecchi di 35 giorni. */
const ETA_MASSIMA_MS = 30 * 24 * 60 * 60 * 1000;

/** Più giovani di così li sta ancora inviando il consumo che li ha creati. */
const ETA_MINIMA_RITENTATIVO_MS = 5 * 60 * 1000;

async function inviaEvento(evento: MeteredUsageEvent): Promise<boolean> {
  try {
    await getStripe().billing.meterEvents.create({
      event_name: WHATSAPP_OVERAGE_METER_EVENT,
      // L'id della riga come identificativo: un nuovo tentativo sullo stesso
      // evento non viene sommato una seconda volta.
      identifier: evento.id,
      // L'istante del consumo, non dell'invio: un evento ritentato il giorno
      // dopo appartiene comunque al periodo in cui la conversazione è avvenuta.
      timestamp: Math.floor(evento.createdAt.getTime() / 1000),
      payload: {
        stripe_customer_id: evento.stripeCustomerId,
        value: String(evento.quantity),
      },
    });

    await prisma.meteredUsageEvent.update({
      where: { id: evento.id },
      data: { reportedAt: new Date() },
    });
    return true;
  } catch (error) {
    reportBillingError(error, "overage-meter-event");
    console.error("[billing/overage] Evento di consumo non inviato", {
      eventoId: evento.id,
      organizationId: evento.organizationId,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

/**
 * Registra la parte di un consumo WhatsApp che supera l'incluso. Non lancia.
 *
 * Chiamata subito dopo l'incremento del contatore: la conversazione è già
 * partita e un guasto qui non deve fermarla. La riga nel database nasce prima
 * dell'invio, così un invio fallito resta da ritentare invece di sparire.
 */
export async function registraConsumoExtra(
  organizationId: string,
  usatiDopo: number,
  quantita: number
): Promise<void> {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        bonusWhatsappCredits: true,
        subscription: {
          select: { status: true, stripeCustomerId: true, stripeOverageItemId: true },
        },
      },
    });

    const subscription = organization?.subscription;
    if (!organization || !subscription || !isOverageBillingActive(subscription)) return;

    const incluse =
      PLANS[subscription.status].waConversationsLimit + organization.bonusWhatsappCredits;
    const unita = unitaOltreIncluso(usatiDopo, incluse, quantita);
    if (unita === 0) return;

    const evento = await prisma.meteredUsageEvent.create({
      data: {
        organizationId,
        stripeCustomerId: subscription.stripeCustomerId as string,
        quantity: unita,
      },
    });

    console.info("[BILLING-OVERAGE]", { organizationId, unita, usatiDopo, incluse });
    await inviaEvento(evento);
  } catch (error) {
    reportBillingError(error, "overage-record");
    console.error("[billing/overage] Consumo extra non registrato", {
      organizationId,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}

export interface EsitoRitentativi {
  inviati: number;
  falliti: number;
  scaduti: number;
}

/**
 * Ritenta gli eventi rimasti indietro. Chiamato dal controllo giornaliero.
 *
 * Gli eventi più vecchi di `ETA_MASSIMA_MS` non si inviano più — Stripe li
 * rifiuterebbe — ma si contano e si segnalano: sono addebiti da sistemare a
 * mano, e l'unico modo perché qualcuno lo faccia è saperlo.
 *
 * Il caso limite, documentato: se Stripe accetta l'evento e subito dopo
 * fallisce la scrittura di `reportedAt`, la riga resta da inviare. Entro 24
 * ore Stripe riconosce l'`identifier` e non lo somma di nuovo; oltre, potrebbe.
 * È il doppio addebito di una conversazione in un caso che richiede un guasto
 * del database nell'istante fra due chiamate, contro la perdita certa di tutti
 * gli eventi di un disservizio Stripe se non si ritentasse affatto.
 */
export async function ritentaConsumiNonInviati(limite = 500): Promise<EsitoRitentativi> {
  const adesso = Date.now();

  const [daInviare, scaduti] = await Promise.all([
    prisma.meteredUsageEvent.findMany({
      where: {
        reportedAt: null,
        createdAt: {
          lt: new Date(adesso - ETA_MINIMA_RITENTATIVO_MS),
          gte: new Date(adesso - ETA_MASSIMA_MS),
        },
      },
      orderBy: { createdAt: "asc" },
      take: limite,
    }),
    prisma.meteredUsageEvent.count({
      where: { reportedAt: null, createdAt: { lt: new Date(adesso - ETA_MASSIMA_MS) } },
    }),
  ]);

  let inviati = 0;
  let falliti = 0;
  for (const evento of daInviare) {
    if (await inviaEvento(evento)) inviati += 1;
    else falliti += 1;
  }

  if (scaduti > 0) {
    reportBillingError(
      new Error(`${scaduti} eventi di consumo troppo vecchi per Stripe`),
      "overage-expired"
    );
  }

  return { inviati, falliti, scaduti };
}

/** Vero se ogni voce dell'abbonamento si rinnova ogni mese. */
function soloVociMensili(subscription: Stripe.Subscription): boolean {
  return subscription.items.data.every(
    (voce) =>
      voce.price.recurring?.interval === "month" && (voce.price.recurring.interval_count ?? 1) === 1
  );
}

/**
 * Allinea la voce a consumo con il piano dell'abbonamento. Non lancia.
 *
 * Il Checkout la aggiunge già all'Enterprise mensile; questo passaggio copre
 * gli altri ingressi — un cambio di piano dal portale Stripe, un abbonamento
 * nato prima che il prezzo a consumo fosse configurato — e soprattutto scrive
 * `stripeOverageItemId` solo dopo aver **visto** la voce su Stripe.
 *
 * # Perché su un piano diverso la voce non si toglie
 *
 * Perché eliminarla a metà periodo rischia di portare via il consumo già
 * maturato e non ancora fatturato. Lasciata lì non costa nulla: gli eventi
 * partono solo per l'Enterprise, e su un altro piano il contatore resta a
 * zero. Basta azzerare il nostro riferimento, che è ciò che accende il consumo.
 */
export async function syncOverageItem(
  organizationId: string,
  subscription: Stripe.Subscription,
  planId: PaidPlanId
): Promise<void> {
  try {
    const priceId = getEnterpriseOveragePriceId();
    let itemId: string | null = null;

    if (priceId && hasMeteredOverage(planId)) {
      const esistente = subscription.items.data.find((voce) => voce.price.id === priceId);

      if (esistente) {
        itemId = esistente.id;
      } else if (soloVociMensili(subscription)) {
        const creata = await getStripe().subscriptionItems.create(
          { subscription: subscription.id, price: priceId, proration_behavior: "none" },
          // Due consegne ravvicinate dello stesso evento non creano due voci.
          { idempotencyKey: `overage-item_${subscription.id}` }
        );
        itemId = creata.id;
      }
      // Enterprise annuale: nessuna voce, `itemId` resta null e il consumo spento.
    }

    await prisma.subscription.update({
      where: { organizationId },
      data: { stripeOverageItemId: itemId },
    });

    console.info("[BILLING-OVERAGE-SYNC]", { organizationId, planId, attivo: itemId !== null });
  } catch (error) {
    reportWebhookError(error, "stripe", "overage-item-sync");
    console.error("[billing/overage] Allineamento voce a consumo non riuscito", {
      organizationId,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}
