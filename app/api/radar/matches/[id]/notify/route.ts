import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { appendMessage } from "@/lib/whatsapp/chat-history";
import { hasSendableCredentials, sendWhatsAppMessageForProvider } from "@/lib/whatsapp/client";
import { resolveWhatsAppCredentials } from "@/lib/whatsapp/credentials";
import { buildRadarProposal, buildRoiProspectus } from "@/lib/radar/proposal-message";

/**
 * Proposta di un lotto del Radar a un lead, via WhatsApp.
 *
 * # Nessun invio senza una persona che lo decide
 *
 * `GET` restituisce l'anteprima, `POST` invia — e il `POST` pretende
 * `confirm: true`. Non esiste alcun percorso automatico: il matchmaking
 * scrive gli abbinamenti e si ferma, e nessun processo in background chiama
 * questa rotta. È una scelta, non una mancanza: un modulo che scopre un'asta
 * e scrive da solo ai contatti è il modo più rapido di far bloccare il numero
 * dell'agenzia da Meta, e di proporre a un cliente un lotto che nessuno ha
 * guardato.
 *
 * # Non tocca nulla del flusso in ingresso
 *
 * Usa `sendWhatsAppMessageForProvider`, la stessa funzione della scheda lead.
 * I webhook, il microservizio e la coda dei messaggi in arrivo non sono
 * coinvolti: qui si esce, non si entra.
 *
 * # Non consuma crediti
 *
 * La conversazione con quel contatto è già stata pagata quando è stata
 * avviata, come per la proposta dal portafoglio.
 */

const schema = z.object({
  confirm: z.literal(true, { error: "Serve la conferma esplicita dell'agente." }),
  /**
   * `proposta` presenta l'immobile a chi cerca casa; `prospetto` presenta i
   * numeri a chi cerca un rendimento. Sono due messaggi diversi perche' hanno
   * due destinatari diversi, e mandare l'uno a chi si aspettava l'altro e' il
   * modo piu' rapido di sembrare fuori fuoco.
   */
  variant: z.enum(["proposta", "prospetto"]).default("proposta"),
});

/** Dati comuni a anteprima e invio, verificati entrambi sull'agenzia. */
async function caricaMatch(id: string, organizationId: string) {
  return prisma.auctionLeadMatch.findFirst({
    where: { id, organizationId },
    select: {
      id: true,
      notifiedAt: true,
      lead: {
        select: {
          id: true,
          clientName: true,
          clientPhone: true,
          waChatJid: true,
          qualificationStatus: true,
        },
      },
      radarProperty: {
        select: {
          kind: true,
          type: true,
          comune: true,
          zona: true,
          priceEur: true,
          squareMeters: true,
          auctionDate: true,
          lotto: true,
          transferCostsEur: true,
          renovationCostEur: true,
          marketValueEur: true,
          monthlyRentEur: true,
        },
      },
      organization: { select: { agencyName: true } },
    },
  });
}

type MatchCaricato = NonNullable<Awaited<ReturnType<typeof caricaMatch>>>;

/**
 * Il testo, in un posto solo.
 *
 * Chiamata sia dall'anteprima sia dall'invio: comporre due volte lo stesso
 * messaggio significherebbe mostrarne uno e spedirne un altro il giorno in cui
 * una delle due copie cambia.
 */
function componiTesto(variant: "proposta" | "prospetto", match: MatchCaricato): string {
  const comune = {
    clientName: match.lead.clientName,
    agencyName: match.organization.agencyName,
    ...match.radarProperty,
  };
  return variant === "prospetto" ? buildRoiProspectus(comune) : buildRadarProposal(comune);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const match = await caricaMatch(id, session.user.organizationId);
  if (!match) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const variant =
    new URL(_request.url).searchParams.get("variant") === "prospetto" ? "prospetto" : "proposta";

  return NextResponse.json({
    variant,
    preview: componiTesto(variant, match),
    optedOut: match.lead.qualificationStatus === "OPT_OUT",
    alreadyNotifiedAt: match.notifiedAt,
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const organizationId = session.user.organizationId;
  const { id } = await context.params;

  // La conferma esplicita nel corpo, come per le cancellazioni: impedisce che
  // una chiamata partita per sbaglio scriva a un cliente.
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "confirmation_required", message: "Conferma richiesta prima dell'invio." },
      { status: 400 }
    );
  }

  const [match, config] = await Promise.all([
    caricaMatch(id, organizationId),
    prisma.whatsAppConfig.findFirst({ where: { organizationId } }),
  ]);

  if (!match) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Un contatto in opt-out non riceve più nulla, nemmeno una proposta che
  // l'agente ritiene interessante (CLAUDE.md §5).
  if (match.lead.qualificationStatus === "OPT_OUT") {
    return NextResponse.json(
      { error: "opt_out", message: "Questo contatto ha revocato il consenso." },
      { status: 409 }
    );
  }

  if (!config || !hasSendableCredentials(resolveWhatsAppCredentials(config))) {
    return NextResponse.json(
      { error: "whatsapp_not_connected", message: "WhatsApp non è collegato." },
      { status: 409 }
    );
  }

  const testo = componiTesto(parsed.data.variant, match);

  try {
    await sendWhatsAppMessageForProvider(
      resolveWhatsAppCredentials(config),
      match.lead.clientPhone,
      testo,
      match.lead.waChatJid
    );
  } catch (error) {
    console.error("[RADAR-NOTIFY] Invio non riuscito", {
      matchId: match.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "send_failed", message: "Invio non riuscito. Riprova." },
      { status: 502 }
    );
  }

  // `notifiedAt` si scrive DOPO l'invio riuscito: segnarlo prima farebbe
  // risultare avvisato un cliente che non ha ricevuto nulla, e nessuno
  // riproverebbe.
  await prisma.auctionLeadMatch.update({
    where: { id: match.id },
    data: { notifiedAt: new Date(), seenAt: new Date() },
  });

  // In cronologia: la chat in scheda deve corrispondere a quella vera.
  await appendMessage(match.lead.id, {
    sender: "bot",
    text: testo,
    timestamp: new Date().toISOString(),
  });

  console.info("[RADAR-NOTIFY]", { matchId: match.id, leadId: match.lead.id, organizationId });

  return NextResponse.json({ sent: true });
}
