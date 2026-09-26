import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSecret } from "@/lib/env";
import { normalizePhone } from "@/lib/whatsapp/types";
import { handleInboundWhatsAppMessage } from "@/lib/whatsapp/inbound";
import { reportWebhookError } from "@/lib/observability/report-error";
import { transcribeVoiceBuffer } from "@/lib/whatsapp/voice-note";
import { replyToUntranscribableVoiceNote, VOICE_TOO_LONG_REPLY } from "@/lib/whatsapp/voice-reply";

/**
 * Eventi dal microservizio: esito dell'abbinamento e messaggi in arrivo.
 *
 * È una rotta **pubblica** — il microservizio non ha una sessione NextAuth —
 * e per questo autenticata con un segreto condiviso. Senza, chiunque
 * conoscesse un `sessionId` potrebbe dichiarare connessa un'agenzia o, molto
 * peggio, iniettarle conversazioni inventate facendo rispondere l'AI a
 * clienti che non hanno mai scritto.
 *
 * Fail-closed: senza `WHATSAPP_SERVICE_TOKEN` configurato risponde 401 a
 * chiunque, invece di restare aperta.
 */

/**
 * Il percorso completo — creazione del lead, chiamata all'AI, invio della
 * risposta — supera comodamente il limite predefinito di Vercel.
 *
 * Il webhook Meta lo dichiarava gia'; questa rotta e' nata dopo ed era rimasta
 * scoperta. Senza, la funzione viene interrotta a meta': l'AI ha generato la
 * risposta, l'invio non parte, e nei log non resta un errore ma un
 * troncamento — cioe' il caso piu' difficile da diagnosticare.
 */
export const maxDuration = 60;

const eventSchema = z.object({
  sessionId: z.string().min(1),
  event: z.enum(["connected", "disconnected", "message", "unhealthy"]),
  /**
   * Da quanti millisecondi la sessione non riesce ad agganciarsi.
   *
   * Presente solo su `unhealthy`. Viaggia nel payload invece di essere
   * calcolato qui perché è il microservizio a sapere quando il socket è
   * caduto: la piattaforma vede solo l'istante in cui gliene arriva notizia.
   */
  unhealthyForMs: z.number().int().nonnegative().optional(),
  /**
   * Quanto è durata la caduta da cui la sessione sta tornando su.
   *
   * Presente solo su `connected`, e solo quando c'era davvero una caduta: al
   * primo abbinamento non c'è nulla da cui tornare. È il dato che permette di
   * dire nei log se l'avviso in attesa è stato annullato, e dopo quanto.
   */
  downForMs: z.number().int().nonnegative().optional(),
  /** Vero se per quella caduta l'avviso all'agenzia era già partito. */
  eraInAllerta: z.boolean().optional(),
  /** Numero abbinato, presente sugli eventi di connessione. */
  phoneNumber: z.string().optional(),
  /** Messaggio in arrivo, presente solo su `event: "message"`. */
  message: z
    .object({
      from: z.string().min(6),
      text: z.string(),
      /** Nota vocale: byte in base64, trascritti qui prima della qualificazione. */
      audio: z
        .object({ data: z.string().min(16), mimeType: z.string().min(3) })
        .optional(),
      /** Vocale troppo lungo per essere consegnato: si risponde senza trascrivere. */
      audioTooLarge: z.boolean().optional(),
      profileName: z.string().optional(),
      /** Indirizzo esatto della chat, dominio incluso. Assente dai microservizi non aggiornati. */
      jid: z.string().min(3).optional(),
      isLid: z.boolean().optional(),
      /** Comando scritto dall'agenzia dentro la chat, non messaggio del cliente. */
      fromAgent: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Avvisa l'agenzia che la sessione WhatsApp e' giu' da troppo tempo.
 *
 * # Perche' e' una funzione e non due righe nel ramo
 *
 * Perche' prima stava dentro `disconnected` e ci e' rimasta per mesi: era
 * l'unico posto da cui si poteva avvisare, quindi nessuno si e' chiesto se
 * fosse il posto giusto. Spostandola qui il punto da cui parte l'avviso
 * diventa una scelta esplicita — oggi e' `unhealthy`, cioe' dopo cinque
 * minuti di silenzio continuativo — e spostarla di nuovo domani e' una riga.
 *
 * Non lancia: un'email che non parte non deve far fallire la rotta, o il
 * microservizio riproverebbe a consegnare lo stesso evento all'infinito.
 */
async function avvisaDisconnessione(
  config: { id: string; organizationId: string; phoneNumber: string | null },
  daMinuti: number
): Promise<void> {
  try {
    const { resolveOwner } = await import("@/lib/email/recipients");
    const { sendWhatsAppDisconnectedEmail } = await import("@/lib/email/transactional");
    const { inviaPushAUtenti } = await import("@/lib/push/send");
    const { pushSessioneWhatsappDisconnessa } = await import("@/lib/push/messages");

    const owner = await resolveOwner(config.organizationId);
    if (!owner) return;

    // Email e push insieme: la push è quella che arriva sul telefono mentre
    // l'agente è in visita, l'email quella che resta quando torna in ufficio.
    const [outcome, push] = await Promise.all([
      sendWhatsAppDisconnectedEmail({
        to: owner.email,
        firstName: owner.firstName,
        phoneNumber: config.phoneNumber,
      }),
      inviaPushAUtenti([owner.id], pushSessioneWhatsappDisconnessa()),
    ]);

    console.info("[WA-DISCONNECTED-NOTIFY]", {
      organizationId: config.organizationId,
      daMinuti,
      outcome,
      push: push.inviate,
    });
  } catch (error) {
    console.error("[api/whatsapp/qr/webhook] Avviso di disconnessione non inviato", {
      organizationId: config.organizationId,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}

/** Confronto a tempo costante: un confronto ingenuo trasforma il token in un oracolo. */
function tokenMatches(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  /*
   * La prima riga della rotta, prima di qualunque controllo.
   *
   * Serve a rispondere a una domanda sola, che finora non aveva risposta:
   * **la chiamata arriva?** Ogni altra uscita di questa rotta lascia gia' una
   * traccia, ma tutte stanno DOPO l'autenticazione: se il microservizio non
   * chiamava affatto, o veniva respinto sulla porta, nei log di Vercel non
   * restava niente — e un messaggio mai consegnato era indistinguibile da un
   * messaggio mai scritto.
   *
   * Niente corpo e niente intestazioni: qui passano numeri di telefono e
   * testi di clienti, e nei log non ci vanno (CLAUDE.md §5). Bastano la
   * lunghezza e il tipo dichiarato per riconoscere la chiamata.
   */
  console.info("[QR-WEBHOOK] Chiamata ricevuta", {
    lunghezzaCorpo: request.headers.get("content-length") ?? "sconosciuta",
    haAutorizzazione: Boolean(request.headers.get("authorization")),
  });

  const expected = readSecret("WHATSAPP_SERVICE_TOKEN");
  if (!expected) {
    console.error("[api/whatsapp/qr/webhook] WHATSAPP_SERVICE_TOKEN assente: rotta chiusa.");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer || !tokenMatches(bearer, expected)) {
    /*
     * Era l'unica uscita muta rimasta, ed e' quella che conta di piu'.
     *
     * Un token disallineato fra Render e Vercel — tipicamente dopo aver
     * rigenerato il segreto da una parte sola — produce esattamente il
     * sintomo "l'assistente non risponde piu' e non si capisce perche'":
     * il microservizio riceve i messaggi, li consegna, si becca un 401 e
     * su Vercel non compariva una riga.
     *
     * Del token non si scrive niente, nemmeno un pezzo: si dice solo se
     * l'intestazione c'era, che e' quanto basta a distinguere "chiamata
     * senza credenziali" da "credenziali sbagliate".
     */
    console.error("[QR-WEBHOOK] Chiamata respinta: token non valido", {
      intestazionePresente: Boolean(bearer),
      nota: "WHATSAPP_SERVICE_TOKEN su Vercel e SERVICE_TOKEN su Render devono coincidere",
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const corpo = await request.json().catch(() => null);
  const parsed = eventSchema.safeParse(corpo);
  if (!parsed.success) {
    /*
     * Scarto tracciato, non silenzioso.
     *
     * Questa era l'unica uscita della rotta che non lasciava traccia: un
     * payload rifiutato spariva con un 400 e nei log di Vercel non restava
     * nulla, quindi un lead mai comparso era indistinguibile da un messaggio
     * mai inviato. Si registrano i **campi** che non hanno superato lo schema,
     * mai i loro valori: il testo di un messaggio e il numero di chi scrive
     * sono dati personali e nei log non ci vanno (CLAUDE.md §5).
     */
    console.error("[WEBHOOK IGNORATO]: payload non conforme allo schema", {
      campi: parsed.error.issues.map((i) => `${i.path.join(".") || "(radice)"}: ${i.code}`),
      chiaviRicevute:
        corpo && typeof corpo === "object" ? Object.keys(corpo as object) : "(non e' un oggetto)",
    });
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { sessionId, event, phoneNumber, message, unhealthyForMs, downForMs, eraInAllerta } =
    parsed.data;

  // Accettato: da qui in poi ogni esito lascia una traccia propria. Questa
  // riga chiude il cerchio — dice che la chiamata era valida e quale evento
  // portava, senza il quale "arrivata" e "elaborata" restano indistinguibili.
  console.info("[QR-WEBHOOK] Evento accettato", {
    sessionId,
    event,
    haTesto: Boolean(message?.text),
    haAudio: Boolean(message?.audio),
    dallAgenzia: Boolean(message?.fromAgent),
  });

  // `include` completo e non una `select` parziale: `handleInboundWhatsAppMessage`
  // richiede l'organizzazione intera, ed è lo stesso oggetto che gli passano
  // gli altri webhook di trasporto.
  const config = await prisma.whatsAppConfig.findUnique({
    where: { qrSessionId: sessionId },
    include: { organization: true },
  });

  // Sessione sconosciuta: 200 e non 404. Il microservizio non deve ritentare
  // all'infinito per un'agenzia che nel frattempo si è scollegata.
  if (!config) {
    console.warn("[WEBHOOK IGNORATO]: sessione sconosciuta", { sessionId });
    return NextResponse.json({ status: "ignored" });
  }

  if (event === "connected") {
    /*
     * Tornata su: se un avviso era in attesa, qui si annulla.
     *
     * "In attesa" non significa che ci fosse una coda da svuotare. L'avviso
     * non viene programmato con un timer — su una funzione serverless un
     * timer di cinque minuti non sopravvive alla risposta — ma semplicemente
     * non ancora inviato, perche' parte solo con l'evento `unhealthy`.
     * Questa riga serve a vederlo nei log: senza, una caduta rientrata in
     * venti secondi e una caduta mai avvenuta sono indistinguibili, e nel
     * giorno in cui qualcuno chiede "ma quante volte e' successo?" non c'e'
     * modo di rispondere.
     */
    if (downForMs !== undefined) {
      console.info("[WA-DISCONNECT-NOTIFY-ANNULLATA]", {
        organizationId: config.organizationId,
        agenzia: config.organization.agencyName,
        giuPerSecondi: Math.round(downForMs / 1000),
        avvisoGiaPartito: Boolean(eraInAllerta),
        esito: eraInAllerta
          ? "l'agenzia era gia' stata avvisata: la caduta era durata oltre la finestra"
          : "rientrata entro la finestra di tolleranza: nessuna email inviata",
      });
    }

    await prisma.whatsAppConfig.update({
      where: { id: config.id },
      data: {
        isConnected: true,
        provider: "qr",
        qrConnectedAt: new Date(),
        ...(phoneNumber ? { phoneNumber } : {}),
      },
    });
    return NextResponse.json({ status: "ok" });
  }

  if (event === "unhealthy") {
    /*
     * Sessione che non si riaggancia da troppo tempo.
     *
     * Il microservizio riprova da solo con attesa progressiva, e quasi sempre
     * ce la fa in pochi secondi: questo evento arriva solo quando NON ce l'ha
     * fatta per minuti, cioè quando ha smesso di essere un contrattempo ed è
     * diventato un guasto. Da lì in poi ogni cliente che scrive a
     * quell'agenzia non riceve niente, e l'agenzia non ha modo di saperlo —
     * dall'altro capo non c'è un utente che segnala, c'è un lead che se ne va.
     *
     * Non si cambia `isConnected`: lo stato della sessione lo dichiarano gli
     * eventi di connessione, e sovrascriverlo qui farebbe risultare staccata
     * un'agenzia che nel frattempo si è riagganciata. Questo evento avvisa, non
     * decide.
     */
    const minuti = Math.round((unhealthyForMs ?? 0) / 60_000);

    console.error("[WA-SESSION-UNHEALTHY]", {
      sessionId,
      organizationId: config.organizationId,
      agenzia: config.organization.agencyName,
      daMinuti: minuti,
    });

    reportWebhookError(
      new Error(`Sessione WhatsApp non riagganciata da ${minuti} minuti`),
      "whatsapp-qr",
      "sessione-non-riagganciata"
    );

    /*
     * E' QUI che si avvisa l'agenzia, non alla prima caduta.
     *
     * Prima l'email partiva dal ramo `disconnected`, cioe' al primo evento
     * utile: un deploy del microservizio o un singhiozzo di rete di tre
     * secondi facevano arrivare al titolare "Sessione WhatsApp disconnessa",
     * e trenta secondi dopo tutto era di nuovo verde. Un avviso che si
     * smentisce da solo insegna a ignorare gli avvisi, e il giorno in cui la
     * sessione cade davvero quell'email viene archiviata come le altre.
     *
     * Questo evento arriva solo dopo cinque minuti di sessione giu' **in
     * modo continuativo** — il microservizio lo misura su un processo vivo,
     * cosa che una funzione serverless non puo' fare — e una sola volta per
     * episodio. A quel punto non e' piu' un contrattempo: ogni cliente che
     * scrive a quell'agenzia non riceve niente.
     */
    await avvisaDisconnessione(config, minuti);

    return NextResponse.json({ status: "ok" });
  }

  if (event === "disconnected") {
    // La sessione resta salvata: con un client non ufficiale la caduta è
    // frequente e spesso temporanea. Cancellarla costringerebbe a rifare
    // l'abbinamento da zero a ogni disconnessione passeggera; a staccare
    // davvero è l'agente, dal pulsante "Disconnetti".
    await prisma.whatsAppConfig.update({
      where: { id: config.id },
      data: { isConnected: false },
    });

    /*
     * Qui NON si avvisa piu' nessuno.
     *
     * La finestra di tolleranza non e' un ritardo programmato — su una
     * funzione serverless non esiste un timer che sopravviva alla risposta —
     * ma uno spostamento: chi conta i cinque minuti e' il microservizio, che
     * e' un processo vivo, e quando sono passati manda `unhealthy`. Qui resta
     * solo l'annotazione che il conto e' partito.
     */
    // Solo se era connessa fino a un attimo fa: il microservizio emette piu'
    // eventi di disconnessione per la stessa caduta (riconnessioni tentate e
    // fallite), e senza questa condizione il log si riempirebbe di righe che
    // raccontano lo stesso episodio.
    if (config.isConnected) {
      console.info("[WA-DISCONNECT-NOTIFY-PROGRAMMATA]", {
        organizationId: config.organizationId,
        agenzia: config.organization.agencyName,
        nota: "nessuna email adesso: parte solo se la sessione resta giu' oltre la finestra",
      });
    }

    return NextResponse.json({ status: "ok" });
  }

  if (!message) {
    console.warn("[WEBHOOK IGNORATO]: evento 'message' senza corpo del messaggio", { sessionId });
    return NextResponse.json({ error: "missing_message" }, { status: 400 });
  }

  /*
   * Sessione risultante disconnessa.
   *
   * Non blocca: se un messaggio arriva, la sessione **e' viva** — e' il nostro
   * flag a essere rimasto indietro, perche' quando il microservizio muore non
   * fa in tempo a mandare l'evento `disconnected`. Scartare qui significherebbe
   * perdere un lead vero per un dato stantio. Si registra e si prosegue, cosi'
   * la discrepanza e' visibile invece che silenziosa.
   */
  if (!config.isConnected) {
    console.warn("[WEBHOOK IGNORATO]: nessuno scarto, ma la sessione risultava disconnessa", {
      sessionId,
      nota: "flag isConnected disallineato: il messaggio viene comunque elaborato",
    });
  }

  /**
   * Nota vocale → testo, prima di toccare la qualificazione.
   *
   * Su WhatsApp rispondere a voce e' normale, e un vocale non trascritto
   * interromperebbe il flusso proprio nel momento in cui il cliente sta
   * collaborando. Se la trascrizione non riesce non si resta in silenzio: si
   * risponde chiedendo di scrivere — chi ha appena parlato al telefono
   * interpreta il silenzio come un numero non attivo.
   */
  let messageText = message.text;

  if (message.audioTooLarge) {
    await replyToUntranscribableVoiceNote(config, message, VOICE_TOO_LONG_REPLY);
    return NextResponse.json({ status: "ok" });
  }

  if (message.audio) {
    const outcome = await transcribeVoiceBuffer(
      Buffer.from(message.audio.data, "base64"),
      "nota-vocale.ogg",
      message.audio.mimeType
    );

    if (!outcome.ok) {
      console.warn("[WEBHOOK IGNORATO]: trascrizione della nota vocale non riuscita", {
      reason: outcome.reason,
    });
      await replyToUntranscribableVoiceNote(config, message, outcome.reply);
      return NextResponse.json({ status: "ok" });
    }

    console.info("[WA-VOICE-NOTE]", { chars: outcome.text.length });
    messageText = outcome.text;
  }

  if (!messageText.trim()) {
    // Anche questo scarto lasciava la rotta senza traccia. Un messaggio di soli
    // allegati o di sole emoji finisce qui legittimamente, ma se ci finisce un
    // messaggio vero si deve poterlo vedere.
    console.warn("[WEBHOOK IGNORATO]: messaggio senza testo utilizzabile", {
      sessionId,
      haAudio: Boolean(message.audio),
      charsGrezzi: message.text.length,
    });
    return NextResponse.json({ status: "ok" });
  }

  try {
    await handleInboundWhatsAppMessage(config, {
      fromPhone: normalizePhone(message.from),
      text: messageText,
      profileName: message.profileName,
      chatJid: message.jid,
      fromAgent: message.fromAgent,
      // Il filtro del primo contatto deve sapere che sta leggendo un parlato:
      // il registro di un vocale somiglia a quello di chi ti conosce, e senza
      // questa riga un primo contatto a voce veniva scartato in silenzio.
      daVocale: Boolean(message.audio),
    });
  } catch (error) {
    // 200 comunque: un errore nostro non deve innescare rinvii a ripetizione
    // dal microservizio, che rischierebbero di far rispondere l'AI più volte
    // allo stesso messaggio.
    console.error("[api/whatsapp/qr/webhook] Gestione messaggio non riuscita", {
      sessionId,
      error,
    });
  }

  return NextResponse.json({ status: "ok" });
}
