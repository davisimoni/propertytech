import "server-only";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Accredita un pacchetto di conversazioni WhatsApp acquistato una tantum.
 *
 * # Perché sta qui e non dentro la rotta del webhook
 *
 * Perché un file di rotta Next può esportare solo i metodi HTTP: lasciandola
 * là dentro non sarebbe collaudabile, e questa è l'unica funzione della
 * piattaforma che **regala credito** se sbagliata.
 *
 * # L'unico handler che deve difendersi dalle consegne doppie
 *
 * Stripe può recapitare lo stesso evento più volte, e gli altri handler del
 * webhook lo reggono perché **scrivono un valore**: attivare due volte il
 * piano "pro" lo lascia "pro". Questo invece **incrementa**, e una seconda
 * consegna regalerebbe cento crediti non pagati.
 *
 * La difesa è il vincolo unico su `stripeSessionId` **dentro la stessa
 * transazione** dell'incremento: alla seconda consegna la `create` viola il
 * vincolo, la transazione si annulla per intero e il saldo resta quello
 * giusto. Non un controllo "esiste già?" seguito da una scrittura: fra i due
 * ci sarebbe una finestra in cui due consegne simultanee passano entrambe.
 */

/** Tetto difensivo: oltre, è quasi certamente un metadato manomesso. */
const MAX_CREDITI_PER_RICARICA = 10_000;

export type EsitoRicarica = "accreditata" | "gia_elaborata" | "non_pagata" | "metadati_non_validi";

export async function accreditaRicarica(
  session: Pick<Stripe.Checkout.Session, "id" | "metadata" | "payment_status">
): Promise<EsitoRicarica> {
  const organizationId = session.metadata?.organizationId;
  const credits = Number.parseInt(session.metadata?.credits ?? "", 10);

  if (
    !organizationId ||
    !Number.isInteger(credits) ||
    credits <= 0 ||
    credits > MAX_CREDITI_PER_RICARICA
  ) {
    console.error("[credit-recharge] Metadati non validi", { sessionId: session.id });
    return "metadati_non_validi";
  }

  /*
   * Pagato davvero, non solo "sessione completata".
   *
   * Con i metodi di pagamento asincroni una sessione può concludersi con il
   * pagamento ancora in corso: accreditare qui significherebbe regalare
   * crediti su un incasso che potrebbe non arrivare mai.
   */
  if (session.payment_status !== "paid") {
    console.info("[credit-recharge] Non ancora pagata: nessun accredito", {
      sessionId: session.id,
      paymentStatus: session.payment_status,
    });
    return "non_pagata";
  }

  try {
    await prisma.$transaction([
      prisma.creditRecharge.create({
        data: { stripeSessionId: session.id, organizationId, credits },
      }),
      prisma.organization.update({
        where: { id: organizationId },
        data: { bonusWhatsappCredits: { increment: credits } },
      }),
      // Gli avvisi di soglia ripartono: con la dotazione aumentata l'agenzia
      // torna sotto l'80%, e senza azzerare la memoria non riceverebbe né
      // l'avviso né il "crediti esauriti" quando anche il pacchetto finisce.
      // `updateMany`: un contatore mancante non deve far fallire l'accredito.
      prisma.usageTracker.updateMany({
        where: { organizationId },
        data: { whatsappNotifiedPct: 0 },
      }),
    ]);

    console.info("[CREDIT-RECHARGE]", { organizationId, credits, sessionId: session.id });
    return "accreditata";
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Consegna ripetuta dello stesso evento: i crediti erano già stati
      // accreditati. È il funzionamento previsto, non un guasto.
      console.info("[credit-recharge] Già elaborata", { sessionId: session.id });
      return "gia_elaborata";
    }
    throw error;
  }
}
