import "server-only";
import { sendEmail, type EmailOutcome } from "@/lib/notifications/email";
import { EXTRA_CREDITS_PACK_SIZE, formatCount, PLANS } from "@/lib/plans";
import { SITE_URL } from "@/lib/seo";
import { escapeHtml, renderEmail, renderEmailText, type EmailLayoutInput } from "./layout";

/**
 * Email di servizio di PropertyTech.
 *
 * # Solo eventi che richiedono un'azione o documentano un impegno
 *
 * L'agente riceve già decine di email al giorno dai portali. Un avviso per
 * ogni lead qualificato, ogni abbinamento o ogni collaboratore entrato in team
 * abitua a ignorare il mittente, e il giorno in cui arriva "sessione WhatsApp
 * disconnessa" finisce nello stesso mucchio. Per questo le email di sistema
 * sono limitate a cinque categorie, e ciò che non vi rientra si consulta
 * nell'applicazione:
 *
 * 1. **Sessione WhatsApp** — disconnessione: l'assistente IA è fermo.
 * 2. **Crediti operativi** — 80% e 100% della dotazione (pacchetti compresi).
 * 3. **Pubblicazione social** — pubblicazione non riuscita su Facebook/Instagram.
 * 4. **Iscrizione e abbonamento** — conferma di iscrizione, attivazione, cambio
 *    piano, rinnovo, pagamento non riuscito, disdetta.
 * 5. **Lead qualificato** — l'assistente IA porta un contatto allo stato
 *    Qualificato. È l'UNICO stato della pipeline che genera una notifica:
 *    visita, proposta, chiusura e gli altri passaggi no.
 *
 * Le categorie 1, 2, 3 e 5 arrivano anche come notifica push sui dispositivi
 * su cui l'utente le ha attivate (`lib/push/`).
 *
 * Fuori da queste categorie, e non per dimenticanza, restano tre gruppi che
 * non sono notifiche ma parti di un flusso: **accesso e sicurezza**
 * (reimpostazione e modifica della password, accesso da un nuovo dispositivo),
 * l'**invito** di un collaboratore (`lib/team/invite-email.ts`) e la
 * **richiesta dal modulo di contatto**, diretta alla nostra assistenza. Senza
 * le prime due non si recupera un account né si invita nessuno; senza gli
 * avvisi di sicurezza un accesso non autorizzato passa inosservato.
 *
 * # Priorità sulle preferenze
 *
 * Queste funzioni non leggono `User.newsletterOptOutAt` e non passano
 * `unsubscribeUrl` al trasporto: la disiscrizione dalla newsletter non può
 * spegnerle, per costruzione e non per un controllo che qualcuno potrebbe
 * invertire.
 *
 * # Tono
 *
 * Sobrio e diretto, lessico del settore (lead, richieste di informazioni,
 * immobili, visure, crediti operativi, sessione WhatsApp). Nessuna emoji in
 * oggetto e corpo: in una casella professionale un'icona nell'oggetto è il
 * segnale tipico della posta promozionale. Registro "tu", come tutta
 * l'interfaccia rivolta all'agente (CLAUDE.md §1).
 *
 * # Fail-safe, sempre
 *
 * Nessuna di queste funzioni lancia: sono effetti collaterali di un'azione
 * già riuscita, e un fornitore di posta che non risponde non deve farla
 * fallire.
 */

async function invia(
  to: string,
  subject: string,
  layout: EmailLayoutInput,
  options?: { replyTo?: string }
): Promise<EmailOutcome> {
  try {
    const conPiede: EmailLayoutInput = { ...layout, footer: { tipo: "servizio" } };
    return await sendEmail({
      to,
      subject,
      text: renderEmailText(conPiede),
      html: renderEmail(conPiede),
      ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
    });
  } catch (error) {
    console.error("[email/transactional] Composizione o invio non riusciti", {
      subject,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return "failed";
  }
}

const saluto = (nome?: string | null) =>
  nome?.trim() ? `Buongiorno ${escapeHtml(nome.trim())},` : "Buongiorno,";

const DATA = new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "Europe/Rome" });
const DATA_ORA = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});

const BILLING_URL = `${SITE_URL}/settings?tab=billing`;

// --- 4. Iscrizione e abbonamento ---------------------------------------------

export function sendWelcomeEmail(params: {
  to: string;
  firstName?: string | null;
  agencyName: string;
}): Promise<EmailOutcome> {
  const trial = PLANS.trial;

  return invia(params.to, `Conferma di iscrizione a PropertyTech – ${params.agencyName}`, {
    heading: "Iscrizione completata",
    preheader: "Account attivo in prova gratuita, senza metodo di pagamento.",
    greeting: saluto(params.firstName),
    blocks: [
      {
        text: `L'account di <strong>${escapeHtml(params.agencyName)}</strong> è attivo con il piano Free Trial. Non è richiesto alcun metodo di pagamento e non è previsto alcun addebito automatico al termine della prova.`,
      },
      {
        rows: [
          { label: "Conversazioni WhatsApp incluse", value: formatCount(trial.waConversationsLimit) },
          { label: "Analisi documentali incluse", value: formatCount(trial.ocrDocumentsLimit ?? 0) },
        ],
      },
      { text: "Per rendere operativo l'account si consiglia questa sequenza:" },
      {
        list: [
          "<strong>Collegare la sessione WhatsApp</strong>: l'assistente IA risponde alle richieste di informazioni e qualifica i lead anche fuori orario.",
          "<strong>Attivare l'inoltro delle richieste dai portali</strong>: i contatti di Immobiliare.it, Idealista e Casa.it entrano in pipeline senza inserimento manuale.",
          "<strong>Caricare una visura catastale o un atto</strong>: i dati vengono estratti e strutturati per la scheda dell'immobile.",
        ],
      },
    ],
    cta: { label: "Accedi alla dashboard", url: `${SITE_URL}/dashboard` },
  });
}

export function sendSubscriptionActivatedEmail(params: {
  to: string;
  firstName?: string | null;
  planName: string;
  amountLabel: string;
  renewsOn?: Date | null;
}): Promise<EmailOutcome> {
  return invia(params.to, `Conferma attivazione del piano ${params.planName}`, {
    heading: `Piano ${params.planName} attivo`,
    preheader: "Pagamento registrato, funzioni del piano disponibili.",
    greeting: saluto(params.firstName),
    blocks: [
      {
        text: "Il pagamento è stato registrato e le funzioni e i crediti operativi del piano sono disponibili da subito.",
      },
      {
        rows: [
          { label: "Piano", value: escapeHtml(params.planName) },
          { label: "Importo", value: escapeHtml(params.amountLabel) },
          ...(params.renewsOn
            ? [{ label: "Prossimo rinnovo", value: escapeHtml(DATA.format(params.renewsOn)) }]
            : []),
        ],
      },
      {
        text: "Fatture, ricevute e metodo di pagamento sono consultabili nella sezione Piani e Fatturazione.",
      },
    ],
    cta: { label: "Apri Piani e Fatturazione", url: BILLING_URL },
  });
}

export function sendPlanChangedEmail(params: {
  to: string;
  firstName?: string | null;
  previousPlan: string;
  newPlan: string;
  isUpgrade: boolean;
}): Promise<EmailOutcome> {
  return invia(params.to, `Cambio piano confermato: ${params.newPlan}`, {
    heading: "Cambio piano confermato",
    preheader: `Il piano dell'agenzia è ora ${params.newPlan}.`,
    greeting: saluto(params.firstName),
    blocks: [
      {
        rows: [
          { label: "Piano precedente", value: escapeHtml(params.previousPlan) },
          { label: "Piano attuale", value: escapeHtml(params.newPlan) },
        ],
      },
      {
        text: params.isUpgrade
          ? "Limiti e funzioni del nuovo piano sono attivi da subito. I crediti operativi ripartono con la dotazione piena del nuovo piano."
          : "Il nuovo piano è attivo e i crediti operativi ripartono con la sua dotazione.",
      },
      // Detto esplicitamente su un passaggio a un piano inferiore: scoprire i
      // limiti ridotti durante una conversazione con un cliente è il modo
      // peggiore.
      ...(params.isUpgrade
        ? []
        : [
            {
              notice: {
                tone: "warning" as const,
                text: "I limiti del nuovo piano sono inferiori ai precedenti: verifica conversazioni WhatsApp, postazioni e agende disponibili prima di avviare nuove attività.",
              },
            },
          ]),
    ],
    cta: { label: "Verifica il piano", url: BILLING_URL },
  });
}

export function sendRenewalPaidEmail(params: {
  to: string;
  firstName?: string | null;
  planName: string;
  amountLabel: string;
  periodEnd?: Date | null;
  invoiceUrl?: string | null;
}): Promise<EmailOutcome> {
  return invia(params.to, `Rinnovo del piano ${params.planName} confermato`, {
    heading: "Rinnovo confermato",
    preheader: "Pagamento del rinnovo registrato.",
    greeting: saluto(params.firstName),
    blocks: [
      { text: "Il pagamento del rinnovo è stato registrato. Non è richiesta alcuna azione." },
      {
        rows: [
          { label: "Piano", value: escapeHtml(params.planName) },
          { label: "Importo addebitato", value: escapeHtml(params.amountLabel) },
          ...(params.periodEnd
            ? [{ label: "Prossimo rinnovo", value: escapeHtml(DATA.format(params.periodEnd)) }]
            : []),
        ],
      },
    ],
    cta: {
      label: params.invoiceUrl ? "Scarica la ricevuta" : "Apri Piani e Fatturazione",
      url: params.invoiceUrl || BILLING_URL,
    },
  });
}

export function sendPaymentFailedEmail(params: {
  to: string;
  firstName?: string | null;
  planName: string;
  amountLabel: string;
  updateUrl?: string | null;
}): Promise<EmailOutcome> {
  return invia(params.to, "Pagamento del rinnovo non riuscito: aggiorna il metodo di pagamento", {
    heading: "Pagamento del rinnovo non riuscito",
    preheader: "Aggiorna il metodo di pagamento per evitare la sospensione dell'assistente IA.",
    greeting: saluto(params.firstName),
    blocks: [
      {
        text: `L'addebito di <strong>${escapeHtml(params.amountLabel)}</strong> per il piano <strong>${escapeHtml(params.planName)}</strong> è stato rifiutato. Le cause più frequenti sono una carta scaduta o il raggiungimento del massimale.`,
      },
      {
        notice: {
          tone: "danger",
          text: "Il pagamento verrà ritentato automaticamente nei prossimi giorni. In caso di esito negativo il piano viene sospeso: l'assistente IA smette di rispondere alle richieste di informazioni su WhatsApp.",
        },
      },
    ],
    cta: { label: "Aggiorna il metodo di pagamento", url: params.updateUrl || BILLING_URL },
  });
}

export function sendSubscriptionCancelledEmail(params: {
  to: string;
  firstName?: string | null;
  planName: string;
  activeUntil?: Date | null;
}): Promise<EmailOutcome> {
  const fino = params.activeUntil ? DATA.format(params.activeUntil) : null;

  return invia(params.to, "Disdetta dell'abbonamento registrata", {
    heading: "Disdetta registrata",
    preheader: fino ? `Il piano resta attivo fino al ${fino}.` : "La disdetta è stata registrata.",
    greeting: saluto(params.firstName),
    blocks: [
      {
        text: fino
          ? `Il piano <strong>${escapeHtml(params.planName)}</strong> resta attivo fino al <strong>${escapeHtml(fino)}</strong>, con crediti operativi e funzioni invariati.`
          : `Il piano <strong>${escapeHtml(params.planName)}</strong> è stato disdetto.`,
      },
      {
        text: "Alla scadenza l'account passa al piano gratuito. Lead, immobili, visure e documenti restano in archivio e non vengono cancellati.",
      },
      {
        notice: {
          tone: "info",
          text: "Il piano può essere riattivato in qualsiasi momento, anche dopo la scadenza, senza reinserire dati.",
        },
      },
    ],
    cta: { label: "Riattiva il piano", url: BILLING_URL },
  });
}

// --- 2. Crediti operativi ----------------------------------------------------

/** Etichette dei contatori: nell'email non compare mai un nome di campo. */
export const CREDIT_LABELS = {
  whatsapp: "conversazioni WhatsApp",
  documents: "analisi documentali",
  voice: "report vocali post-visita",
  radar: "analisi di perizie d'asta",
} as const;

export type CreditKind = keyof typeof CREDIT_LABELS;

/** Cosa si ferma al 100%, detto in termini operativi e non di contatore. */
const EFFETTO_ESAURIMENTO: Record<CreditKind, string> = {
  whatsapp:
    "L'assistente IA non risponde più alle nuove richieste di informazioni: i lead continuano a essere registrati in pipeline, ma senza risposta automatica.",
  documents: "Il caricamento di nuove visure, atti e planimetrie da analizzare è sospeso.",
  voice: "La generazione di nuovi report vocali per i proprietari è sospesa.",
  radar: "L'analisi di nuove perizie d'asta è sospesa.",
};

export function sendCreditsWarningEmail(params: {
  to: string;
  firstName?: string | null;
  kind: CreditKind;
  used: number;
  limit: number;
  /**
   * Presente quando oltre il limite si prosegue a pagamento (Enterprise
   * mensile). Cambia il senso dell'avviso: non "stai per fermarti" ma
   * "da lì si paga a consumo".
   */
  aConsumo?: { prezzoUnitario: string };
}): Promise<EmailOutcome> {
  const cosa = CREDIT_LABELS[params.kind];
  const residui = Math.max(0, params.limit - params.used);

  return invia(params.to, `Crediti operativi all'80%: ${cosa}`, {
    heading: `Crediti operativi all'80%: ${cosa}`,
    preheader: `Residue ${formatCount(residui)} su ${formatCount(params.limit)}.`,
    greeting: saluto(params.firstName),
    blocks: [
      {
        rows: [
          { label: "Utilizzate", value: `${formatCount(params.used)} su ${formatCount(params.limit)}` },
          { label: "Residue", value: formatCount(residui) },
        ],
      },
      params.aConsumo
        ? {
            text: `Superata la dotazione inclusa l'assistente IA continua a operare: ogni conversazione aggiuntiva è addebitata a consumo a ${params.aConsumo.prezzoUnitario} nella fattura del rinnovo successivo.`,
          }
        : {
            text: `${EFFETTO_ESAURIMENTO[params.kind]} Questo avviso arriva con margine sufficiente per acquistare un pacchetto di crediti o passare a un piano superiore prima dell'esaurimento.`,
          },
    ],
    cta: { label: params.aConsumo ? "Verifica i consumi" : "Gestisci piano e crediti", url: BILLING_URL },
  });
}

export function sendCreditsExhaustedEmail(params: {
  to: string;
  firstName?: string | null;
  kind: CreditKind;
  limit: number;
}): Promise<EmailOutcome> {
  const cosa = CREDIT_LABELS[params.kind];

  return invia(params.to, `Crediti operativi esauriti: ${cosa}`, {
    heading: `Crediti operativi esauriti: ${cosa}`,
    preheader: "Funzione sospesa fino a ricarica, cambio piano o nuovo periodo.",
    greeting: saluto(params.firstName),
    blocks: [
      {
        notice: {
          tone: "danger",
          text: `È stata raggiunta la dotazione di ${formatCount(params.limit)} ${cosa}. ${EFFETTO_ESAURIMENTO[params.kind]}`,
        },
      },
      {
        text:
          params.kind === "whatsapp"
            ? `L'operatività riprende subito con l'acquisto di un pacchetto da ${EXTRA_CREDITS_PACK_SIZE} conversazioni, con il passaggio a un piano superiore o all'inizio del nuovo periodo mensile. Le conversazioni in sospeso riprendono dal punto in cui si erano fermate.`
            : "L'operatività riprende con il passaggio a un piano superiore o all'inizio del nuovo periodo mensile.",
      },
    ],
    cta: { label: "Ripristina l'operatività", url: BILLING_URL },
  });
}

/**
 * Dotazione esaurita su un piano a consumo: niente si ferma, da qui si paga.
 *
 * Tono informativo e non di allarme: l'agenzia non deve fare nulla perché
 * l'assistente continui, ma deve saperlo prima di trovarlo in fattura.
 */
export function sendOverageStartedEmail(params: {
  to: string;
  firstName?: string | null;
  limit: number;
  prezzoUnitario: string;
}): Promise<EmailOutcome> {
  return invia(params.to, "Conversazioni WhatsApp incluse esaurite: tariffazione a consumo attiva", {
    heading: "Tariffazione a consumo attiva",
    preheader: "L'assistente IA continua a operare senza interruzioni.",
    greeting: saluto(params.firstName),
    blocks: [
      {
        notice: {
          tone: "info",
          text: `Sono state utilizzate le ${formatCount(params.limit)} conversazioni WhatsApp incluse nel piano. L'assistente IA continua a rispondere ai lead senza interruzioni.`,
        },
      },
      {
        text: `Ogni conversazione aggiuntiva è addebitata a <strong>${params.prezzoUnitario}</strong> nella fattura del rinnovo successivo. Il conteggio riparte con il nuovo periodo mensile.`,
      },
    ],
    cta: { label: "Verifica i consumi", url: BILLING_URL },
  });
}

// --- 1. Sessione WhatsApp ----------------------------------------------------

export function sendWhatsAppDisconnectedEmail(params: {
  to: string;
  firstName?: string | null;
  phoneNumber?: string | null;
}): Promise<EmailOutcome> {
  return invia(params.to, "Sessione WhatsApp disconnessa: l'assistente IA è in pausa", {
    heading: "Sessione WhatsApp disconnessa",
    preheader: "Le richieste di informazioni in arrivo non ricevono risposta.",
    greeting: saluto(params.firstName),
    blocks: [
      {
        notice: {
          tone: "danger",
          text: "Fino alla riconnessione l'assistente IA non riceve messaggi e non risponde alle richieste di informazioni: i lead che scrivono in questo momento restano senza risposta.",
        },
      },
      {
        text: params.phoneNumber
          ? `La sessione del numero <strong>${escapeHtml(params.phoneNumber)}</strong> è stata interrotta. Le cause più frequenti sono un telefono rimasto a lungo offline o la revoca del dispositivo collegato dall'app WhatsApp.`
          : "La sessione WhatsApp è stata interrotta. Le cause più frequenti sono un telefono rimasto a lungo offline o la revoca del dispositivo collegato dall'app WhatsApp.",
      },
      { text: "La riconnessione richiede la scansione del codice QR dal telefono dell'agenzia." },
    ],
    cta: { label: "Riconnetti la sessione WhatsApp", url: `${SITE_URL}/leads` },
  });
}

// --- 5. Lead qualificato -----------------------------------------------------

export function sendLeadQualifiedEmail(params: {
  to: string;
  firstName?: string | null;
  leadId: string;
  clientName: string;
  clientPhone: string;
  fonte: string;
  immobile: string | null;
  /** Note di qualificazione emerse dalla conversazione, già leggibili. */
  note: { label: string; value: string }[];
}): Promise<EmailOutcome> {
  return invia(params.to, `Nuovo lead qualificato: ${params.clientName}`, {
    heading: "Nuovo lead qualificato",
    preheader: `${params.clientName} ha completato la qualificazione su WhatsApp.`,
    greeting: saluto(params.firstName),
    blocks: [
      {
        text: `L'assistente IA ha completato la qualificazione di <strong>${escapeHtml(params.clientName)}</strong>. Il contatto è pronto per essere richiamato.`,
      },
      {
        rows: [
          { label: "Nome", value: escapeHtml(params.clientName) },
          { label: "Telefono", value: escapeHtml(params.clientPhone) },
          { label: "Fonte", value: escapeHtml(params.fonte) },
          { label: "Immobile di interesse", value: escapeHtml(params.immobile || "Non indicato") },
        ],
      },
      { subheading: "Note di qualificazione" },
      params.note.length > 0
        ? { rows: params.note.map((nota) => ({ label: escapeHtml(nota.label), value: escapeHtml(nota.value) })) }
        : { text: "Nessuna informazione aggiuntiva emersa dalla conversazione." },
    ],
    cta: {
      label: "Visualizza su PropertyTech",
      url: `${SITE_URL}/leads?id=${encodeURIComponent(params.leadId)}`,
    },
  });
}

// --- 3. Pubblicazione social -------------------------------------------------

export interface PubblicazioneFallita {
  canale: "facebook" | "instagram";
  motivo: string;
}

const NOME_CANALE: Record<PubblicazioneFallita["canale"], string> = {
  facebook: "Facebook",
  instagram: "Instagram",
};

export function sendSocialPublishFailedEmail(params: {
  to: string;
  firstName?: string | null;
  falliti: PubblicazioneFallita[];
  /** Primi caratteri del testo, per riconoscere l'annuncio. */
  anteprima?: string | null;
}): Promise<EmailOutcome> {
  const canali = params.falliti.map((f) => NOME_CANALE[f.canale]).join(" e ");
  const anteprima = params.anteprima?.trim();

  return invia(params.to, `Pubblicazione dell'annuncio non riuscita su ${canali}`, {
    heading: "Pubblicazione non riuscita",
    preheader: `L'annuncio non è stato pubblicato su ${canali}.`,
    greeting: saluto(params.firstName),
    blocks: [
      {
        notice: {
          tone: "danger",
          text: `L'annuncio non è stato pubblicato su <strong>${canali}</strong>. Il contenuto non è andato perso ed è disponibile in Social &amp; Annunci.`,
        },
      },
      {
        rows: params.falliti.map((f) => ({
          label: NOME_CANALE[f.canale],
          value: escapeHtml(f.motivo),
        })),
      },
      ...(anteprima
        ? [{ text: `Annuncio: <em>${escapeHtml(anteprima.slice(0, 140))}${anteprima.length > 140 ? "…" : ""}</em>` }]
        : []),
      {
        text: "Verifica il collegamento della Pagina Facebook e dell'account Instagram Business in Impostazioni, Integrazioni, quindi ripeti la pubblicazione.",
      },
    ],
    cta: { label: "Apri Social & Annunci", url: `${SITE_URL}/social` },
  });
}

// --- Accesso e sicurezza (fuori dalle notifiche, sempre attive) --------------

export function sendNewDeviceEmail(params: {
  to: string;
  firstName?: string | null;
  device: string;
  when: Date;
}): Promise<EmailOutcome> {
  return invia(params.to, "Nuovo accesso all'account PropertyTech", {
    heading: "Accesso da un nuovo dispositivo",
    preheader: "Verifica che l'accesso sia stato effettuato da te.",
    greeting: saluto(params.firstName),
    blocks: [
      { text: "È stato registrato un accesso all'account da un dispositivo non riconosciuto." },
      {
        rows: [
          { label: "Data e ora", value: escapeHtml(DATA_ORA.format(params.when)) },
          { label: "Dispositivo", value: escapeHtml(params.device) },
        ],
      },
      {
        text: "Se l'accesso è stato effettuato da te non è necessaria alcuna azione. In caso contrario modifica subito la password.",
      },
    ],
    cta: { label: "Verifica la sicurezza dell'account", url: `${SITE_URL}/settings` },
  });
}

export function sendPasswordResetEmail(params: {
  to: string;
  firstName?: string | null;
  resetUrl: string;
  expiresInMinutes: number;
}): Promise<EmailOutcome> {
  return invia(params.to, "Reimpostazione della password PropertyTech", {
    heading: "Reimpostazione della password",
    preheader: `Link valido ${params.expiresInMinutes} minuti.`,
    greeting: saluto(params.firstName),
    blocks: [
      {
        text: `È stata richiesta la reimpostazione della password dell'account. Il link è valido per <strong>${params.expiresInMinutes} minuti</strong> e può essere utilizzato una sola volta.`,
      },
      {
        notice: {
          tone: "warning",
          // Prima del pulsante: chi non ha chiesto il reset deve leggerlo
          // prima di arrivarci.
          text: "Se non hai richiesto la reimpostazione, ignora questa email: la password attuale resta valida.",
        },
      },
    ],
    cta: { label: "Imposta una nuova password", url: params.resetUrl },
  });
}

export function sendPasswordUpdatedEmail(params: {
  to: string;
  firstName?: string | null;
  when: Date;
}): Promise<EmailOutcome> {
  return invia(params.to, "Password dell'account PropertyTech modificata", {
    heading: "Password modificata",
    preheader: "Se non sei stato tu, intervieni subito.",
    greeting: saluto(params.firstName),
    blocks: [
      {
        text: `La password dell'account è stata modificata il ${escapeHtml(DATA_ORA.format(params.when))}.`,
      },
      {
        notice: {
          tone: "danger",
          text: "Se la modifica <strong>non</strong> è stata effettuata da te, l'account potrebbe essere compromesso: reimposta subito la password e contatta l'assistenza.",
        },
      },
    ],
    cta: { label: "Accedi all'account", url: `${SITE_URL}/login` },
  });
}

// --- Assistenza interna -------------------------------------------------------

/**
 * Notifica all'assistenza una richiesta arrivata dal modulo pubblico.
 *
 * # Perché il destinatario è fisso e non configurabile
 *
 * È posta interna, diretta alla nostra casella di assistenza. Renderla
 * configurabile dall'ambiente significherebbe che una variabile mancante in
 * produzione fa sparire le richieste dei potenziali clienti senza che nessuno
 * se ne accorga.
 *
 * # Perché `replyTo` è il campo che conta
 *
 * L'email parte dall'indirizzo di servizio, che nessuno presidia: chi in
 * assistenza preme "Rispondi" deve scrivere a chi ha compilato il modulo.
 */
export function sendContactRequestEmail(params: {
  to: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  agencyName?: string | null;
  message: string;
}): Promise<EmailOutcome> {
  const nome = `${params.firstName} ${params.lastName}`.trim();
  const agenzia = params.agencyName?.trim();

  return invia(
    params.to,
    // Nome e agenzia nell'oggetto: in una casella condivisa si decide chi
    // prende in carico una richiesta dall'elenco, senza aprirla.
    `Richiesta dal sito: ${nome}${agenzia ? ` (${agenzia})` : ""}`,
    {
      heading: "Nuova richiesta dal modulo di contatto",
      blocks: [
        {
          rows: [
            { label: "Nome", value: escapeHtml(nome) },
            ...(agenzia ? [{ label: "Agenzia", value: escapeHtml(agenzia) }] : []),
            { label: "Email", value: escapeHtml(params.email) },
            ...(params.phone?.trim()
              ? [{ label: "Telefono", value: escapeHtml(params.phone.trim()) }]
              : []),
          ],
        },
        // Testo scritto da un estraneo dentro un'email HTML: sempre escapato,
        // con gli a capo convertiti.
        { text: escapeHtml(params.message).replace(/\n/g, "<br>") },
      ],
      footnote: "Rispondi a questa email per scrivere direttamente a chi ha compilato il modulo.",
    },
    { replyTo: params.email }
  );
}
