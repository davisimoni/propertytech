import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { readSecret } from "@/lib/env";
import { checkUsageLimit } from "@/lib/usage";
import { normalizePhone } from "@/lib/whatsapp/types";
import { startConversation } from "@/lib/whatsapp/conversation";
import { organizationIdFromAddress, parsePortalEmail } from "@/lib/leads/portal-email";

/**
 * Richieste dei portali che arrivano per email.
 *
 * # Perché questa strada esiste
 *
 * Perché sui portali italiani il webhook lo attiva il portale, su richiesta,
 * con tempi suoi. L'inoltro dalla casella dell'agenzia è invece l'unica cosa
 * che l'agenzia può attivare da sola, in cinque minuti, senza chiedere niente
 * a nessuno.
 *
 * # Cosa NON garantisce la firma
 *
 * La firma dimostra che la chiamata arriva dal servizio di ricezione, non che
 * l'email fosse legittima: chiunque conosca l'indirizzo può scriverci e far
 * nascere una scheda. È inevitabile per definizione — un indirizzo email si
 * consegna ai portali, quindi circola — ed è il motivo per cui la richiesta
 * nasce come `PENDING` e non salta nessuno dei controlli che valgono per le
 * altre: opt-out, crediti, stato della connessione.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Confronto a tempo costante: un `===` lascia misurare il prefisso corretto. */
function firmaValida(request: Request, corpoGrezzo: string): boolean {
  const segreto = readSecret("INBOUND_EMAIL_SECRET");
  // Fail-closed: senza segreto configurato la rotta resta chiusa, invece di
  // diventare un ingresso pubblico da cui chiunque inserisce lead.
  if (!segreto) return false;

  const header =
    request.headers.get("svix-signature") ??
    request.headers.get("webhook-signature") ??
    request.headers.get("x-inbound-signature") ??
    "";
  if (!header) return false;

  const id = request.headers.get("svix-id") ?? request.headers.get("webhook-id") ?? "";
  const timestamp =
    request.headers.get("svix-timestamp") ?? request.headers.get("webhook-timestamp") ?? "";

  /*
   * Due forme accettate, entrambe verificate davvero.
   *
   * Svix — che e' il trasporto dei webhook di Resend — firma
   * `id.timestamp.corpo` con il segreto in base64 e manda piu' firme separate
   * da spazio, ciascuna con un prefisso di versione (`v1,...`). Un HMAC
   * diretto sul solo corpo e' la forma piu' comune altrove. Si accetta
   * l'una o l'altra, ma nessuna delle due e' saltata.
   */
  const chiaveSvix = segreto.startsWith("whsec_")
    ? Buffer.from(segreto.slice(6), "base64")
    : Buffer.from(segreto, "utf8");

  const attese = new Set<string>();
  if (id && timestamp) {
    attese.add(createHmac("sha256", chiaveSvix).update(`${id}.${timestamp}.${corpoGrezzo}`).digest("base64"));
  }
  attese.add(createHmac("sha256", segreto).update(corpoGrezzo).digest("hex"));
  attese.add(createHmac("sha256", segreto).update(corpoGrezzo).digest("base64"));

  for (const pezzo of header.split(" ")) {
    const fornita = pezzo.includes(",") ? pezzo.slice(pezzo.indexOf(",") + 1) : pezzo;
    for (const attesa of attese) {
      const a = Buffer.from(fornita);
      const b = Buffer.from(attesa);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    }
  }

  return false;
}

/** Il destinatario, in qualunque forma il servizio lo consegni. */
function destinatari(payload: unknown): string[] {
  const dati = (payload as { data?: Record<string, unknown> })?.data ?? {};
  const grezzo = dati.to ?? (payload as Record<string, unknown>)?.to;

  if (Array.isArray(grezzo)) return grezzo.map(String);
  if (typeof grezzo === "string") return [grezzo];
  return [];
}

function testo(payload: unknown): { from: string; subject: string; text: string } {
  const dati = ((payload as { data?: Record<string, unknown> })?.data ?? payload) as Record<string, unknown>;

  const html = typeof dati.html === "string" ? dati.html : "";
  const testoSemplice = typeof dati.text === "string" ? dati.text : "";

  return {
    from: typeof dati.from === "string" ? dati.from : "",
    subject: typeof dati.subject === "string" ? dati.subject : "",
    /*
     * Si preferisce il testo semplice, e l'HTML e' il ripiego.
     *
     * Un'email di portale arriva quasi sempre in entrambe le forme, e quella
     * semplice ha gia' le righe "Nome:" separate. Ripulire l'HTML dai tag
     * lascia invece parole attaccate dove c'erano celle di tabella, ed e'
     * esattamente dove un parser a etichette perde il valore.
     */
    text: testoSemplice || html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|tr|div|li)>/gi, "\n").replace(/<[^>]+>/g, " "),
  };
}

export async function POST(request: Request) {
  const corpoGrezzo = await request.text();

  if (!firmaValida(request, corpoGrezzo)) {
    console.warn("[INBOUND-EMAIL] Firma non valida");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const payload = JSON.parse(corpoGrezzo) as unknown;

  /*
   * L'agenzia si ricava dal destinatario, mai dal corpo.
   *
   * Il corpo lo scrive chi manda l'email; il destinatario lo decide il nostro
   * dominio. Accettare un `organizationId` dal payload significherebbe
   * lasciare che un mittente qualsiasi inserisca lead nella pipeline di
   * un'agenzia che non e' la sua (CLAUDE.md §5).
   */
  const organizationId = destinatari(payload)
    .map(organizationIdFromAddress)
    .find((id): id is string => Boolean(id));

  if (!organizationId) {
    // 200 e non 4xx: il servizio di ricezione riproverebbe all'infinito una
    // email che non e' per noi, e non c'e' niente da riprovare.
    console.info("[INBOUND-EMAIL] Destinatario non riconosciuto");
    return NextResponse.json({ status: "ignored" });
  }

  const config = await prisma.whatsAppConfig.findFirst({
    where: { organizationId },
    include: { organization: true },
  });

  if (!config) {
    console.info("[INBOUND-EMAIL] Agenzia inesistente", { organizationId });
    return NextResponse.json({ status: "ignored" });
  }

  const estratto = parsePortalEmail(testo(payload));
  if (!estratto) {
    // Non riconosciuta: nessuna scheda. Meglio una richiesta che l'agente
    // trova nella propria casella che una scheda col nome sbagliato.
    console.info("[INBOUND-EMAIL] Email non riconosciuta", { organizationId });
    return NextResponse.json({ status: "unparsed" });
  }

  const clientPhone = normalizePhone(estratto.clientPhone);

  const esistente = await prisma.lead.findUnique({
    where: { organizationId_clientPhone: { organizationId, clientPhone } },
  });

  // Chi ha revocato il consenso non viene mai ri-ingaggiato, nemmeno da una
  // nuova richiesta arrivata per email (CLAUDE.md §5).
  if (esistente?.qualificationStatus === "OPT_OUT") {
    console.info("[INBOUND-EMAIL] Contatto in opt-out", { organizationId, leadId: esistente.id });
    return NextResponse.json({ status: "opt_out", leadId: esistente.id });
  }

  const lead = esistente
    ? await prisma.lead.update({
        where: { id: esistente.id },
        data: {
          propertyRef: estratto.propertyRef ?? esistente.propertyRef,
          portalSource: estratto.portalSource,
          clientEmail: estratto.clientEmail ?? esistente.clientEmail,
        },
      })
    : await prisma.lead.create({
        data: {
          organizationId,
          clientName: estratto.clientName,
          clientPhone,
          clientEmail: estratto.clientEmail,
          portalSource: estratto.portalSource,
          propertyRef: estratto.propertyRef ?? "Richiesta dal portale",
          qualificationStatus: "PENDING",
        },
      });

  /*
   * I crediti si controllano DOPO aver salvato.
   *
   * Se sono esauriti il lead resta PENDING e visibile in pipeline: l'agenzia
   * non lo perde e lo recupera dopo l'aggiornamento del piano. Rifiutarlo
   * prima significherebbe buttare via una richiesta gia' arrivata.
   */
  const limite = await checkUsageLimit(organizationId, "whatsapp");
  if (limite) {
    console.info("[INBOUND-EMAIL] Crediti esauriti: lead salvato senza ingaggio", {
      organizationId,
      leadId: lead.id,
    });
    return NextResponse.json({ status: "saved_no_credits", leadId: lead.id });
  }

  if (!config.isConnected) {
    console.info("[INBOUND-EMAIL] WhatsApp non collegato: lead salvato senza ingaggio", {
      organizationId,
      leadId: lead.id,
    });
    return NextResponse.json({ status: "saved_not_connected", leadId: lead.id });
  }

  try {
    await startConversation(lead, config, config.organization.agencyName);
    console.info("[INBOUND-EMAIL] Lead ingaggiato", {
      organizationId,
      leadId: lead.id,
      portale: estratto.portalSource,
    });
    return NextResponse.json({ status: "engaged", leadId: lead.id });
  } catch (error) {
    // Il lead resta: l'agente lo vede in pipeline e lo riprende a mano.
    console.error("[INBOUND-EMAIL] Ingaggio fallito", { organizationId, leadId: lead.id, error });
    return NextResponse.json({ status: "saved_engage_failed", leadId: lead.id });
  }
}
