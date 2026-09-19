import "server-only";
import type Stripe from "stripe";
import { reportBillingError } from "@/lib/observability/report-error";
import { getPriceId, PAID_PLAN_IDS } from "./stripe";

/**
 * La configurazione del Portale Clienti Stripe, dichiarata nel codice.
 *
 * # Perché qui e non nella dashboard
 *
 * Perché ogni voce di questa configurazione tiene in piedi un'altra parte del
 * sistema, e nella dashboard nessuno lo vede. Spenta la quantità modificabile,
 * un'agenzia porta a cinque la quantità del proprio piano e lo paga cinque
 * volte. Tolti i downgrade a fine periodo, chi scende di piano perde subito
 * limiti e bonus di un mese già pagato. Scritta qui, la configurazione ha una
 * storia in git e una spiegazione accanto a ogni riga.
 *
 * # Cosa impone
 *
 * - Cambio piano fra i tre piani, mensili e annuali, e codici promozionali.
 * - **Quantità non modificabile**: Stripe la accende da sola sui prodotti.
 * - **Upgrade immediato**, con conguaglio fatturato subito (`always_invoice`):
 *   chi sale paga la differenza e ha il piano nuovo adesso.
 * - **Downgrade e passaggio da annuale a mensile a fine periodo**
 *   (`decreasing_item_amount`, `shortening_interval`): l'agenzia tiene fino alla
 *   scadenza cio' che ha pagato, e il piano cambia quando cambia il prezzo.
 *   E' allora che Stripe manda il `customer.subscription.updated` che il
 *   webhook legge dai prezzi.
 *
 * # Quando gira
 *
 * All'apertura del portale, una volta per istanza del server: la promessa
 * resta in memoria. Se fallisce il portale si apre lo stesso, con la
 * configurazione che c'e', e si riprova alla prossima apertura: un portale che
 * non si apre per un problema di configurazione e' peggio di un downgrade
 * applicato subito.
 */

let inCorso: Promise<boolean> | null = null;

export function assicuraConfigurazionePortale(stripe: Stripe): Promise<boolean> {
  inCorso ??= configura(stripe).catch((error: unknown) => {
    inCorso = null;
    reportBillingError(error, "portal-config");
    console.error("[billing/portal-config] Configurazione del portale non allineata", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return false;
  });
  return inCorso;
}

async function configura(stripe: Stripe): Promise<boolean> {
  // I prodotti dei tre piani con i loro prezzi, ricavati dai prezzi configurati:
  // un prezzo che manca su questo ambiente semplicemente non si offre.
  const perProdotto = new Map<string, string[]>();
  for (const plan of PAID_PLAN_IDS) {
    for (const interval of ["monthly", "yearly"] as const) {
      const priceId = getPriceId(plan, interval);
      if (!priceId) continue;
      const prezzo = await stripe.prices.retrieve(priceId);
      const prodotto = typeof prezzo.product === "string" ? prezzo.product : prezzo.product.id;
      perProdotto.set(prodotto, [...(perProdotto.get(prodotto) ?? []), priceId]);
    }
  }
  if (perProdotto.size === 0) return false;

  // La configurazione predefinita, quella che il portale usa quando la
  // sessione non ne indica un'altra. Si aggiorna quella invece di crearne una
  // nostra, cosi' i dati aziendali impostati in dashboard restano dove sono.
  const [predefinita] = (
    await stripe.billingPortal.configurations.list({ is_default: true, active: true, limit: 1 })
  ).data;
  if (!predefinita) return false;

  await stripe.billingPortal.configurations.update(predefinita.id, {
    features: {
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price", "promotion_code"],
        products: [...perProdotto].map(([product, prices]) => ({
          product,
          prices,
          adjustable_quantity: { enabled: false },
        })),
        proration_behavior: "always_invoice",
        schedule_at_period_end: {
          conditions: [{ type: "decreasing_item_amount" }, { type: "shortening_interval" }],
        },
      },
    },
  });

  return true;
}
