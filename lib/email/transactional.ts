import "server-only";
import { sendEmail, type EmailOutcome } from "@/lib/notifications/email";
import { SITE_URL } from "@/lib/seo";
import { escapeHtml, renderEmail, renderEmailText, type EmailLayoutInput } from "./layout";

/**
 * Email transazionali di PropertyTech.
 *
 * Una funzione tipizzata per evento, tutte sopra lo stesso seam (`sendEmail`)
 * e la stessa impaginazione. Il chiamante passa dati, non HTML: un template
 * costruito nel punto in cui avviene l'evento finisce per divergere dagli
 * altri al primo ritocco.
 *
 * # Fail-safe, sempre
 *
 * Nessuna di queste funzioni lancia. Sono tutte effetti collaterali di
 * un'azione che è già riuscita — un pagamento incassato, un account creato, un
 * credito consumato — e far fallire quell'azione perché un fornitore di posta
 * non risponde sarebbe il tipo di accoppiamento che trasforma un disservizio
 * di terzi in un guasto nostro.
 *
 * `sendEmail` non lancia già di suo e torna `not_configured` senza chiave. Qui
 * si aggiunge la rete su tutto il resto: composizione, dati mancanti, errori
 * imprevisti.
 */

async function invia(to: string, subject: string, layout: EmailLayoutInput): Promise<EmailOutcome> {
  try {
    return await sendEmail({
      to,
      subject,
      text: renderEmailText(layout),
      html: renderEmail(layout),
    });
  } catch (error) {
    console.error("[email/transactional] Composizione o invio non riusciti", {
      subject,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return "failed";
  }
}

const saluto = (nome?: string | null) => (nome?.trim() ? `Ciao ${escapeHtml(nome.trim())},` : "Ciao,");

// --- A. Onboarding e account -------------------------------------------------

export function sendWelcomeEmail(params: {
  to: string;
  firstName?: string | null;
  agencyName: string;
}): Promise<EmailOutcome> {
  return invia(params.to, `Benvenuto su PropertyTech, ${params.agencyName}!`, {
    heading: "Il tuo account è attivo",
    greeting: saluto(params.firstName),
    blocks: [
      {
        text: `Hai creato l'account di <strong>${escapeHtml(params.agencyName)}</strong>. Da qui in avanti l'assistente lavora per te: qualifica i lead su WhatsApp, legge le visure e prepara i report post-visita.`,
      },
      {
        text: "Per partire, tre cose nell'ordine in cui contano:",
      },
      {
        list: [
          "<strong>Collega WhatsApp</strong>: è il modulo che risponde ai lead 24 ore su 24, anche mentre sei in visita.",
          "<strong>Carica una visura</strong>: vedi in trenta secondi cosa l'assistente estrae da un documento.",
          "<strong>Invita i collaboratori</strong>: ognuno vede i lead che gli sono assegnati.",
        ],
      },
    ],
    cta: { label: "Apri la dashboard", url: `${SITE_URL}/dashboard` },
    footnote:
      "Sei in prova gratuita: nessuna carta richiesta, e i crediti inclusi bastano per valutare il prodotto sul lavoro vero.",
  });
}

export function sendNewDeviceEmail(params: {
  to: string;
  firstName?: string | null;
  device: string;
  when: Date;
}): Promise<EmailOutcome> {
  const quando = new Intl.DateTimeFormat("it-IT", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(params.when);

  return invia(params.to, "Nuovo accesso al tuo account PropertyTech", {
    heading: "Accesso da un dispositivo nuovo",
    greeting: saluto(params.firstName),
    blocks: [
      { text: "Il tuo account è stato usato da un dispositivo che non avevamo mai visto." },
      {
        rows: [
          { label: "Quando", value: escapeHtml(quando) },
          { label: "Dispositivo", value: escapeHtml(params.device) },
        ],
      },
      {
        notice: {
          tone: "info",
          text: "Se sei stato tu, non devi fare nulla: questo messaggio arriva una volta sola per dispositivo.",
        },
      },
      {
        text: "Se <strong>non</strong> sei stato tu, cambia subito la password e scollega gli altri accessi.",
      },
    ],
    cta: { label: "Rivedi la sicurezza dell'account", url: `${SITE_URL}/settings` },
  });
}

// --- B. Abbonamenti e pagamenti ---------------------------------------------

export function sendSubscriptionActivatedEmail(params: {
  to: string;
  firstName?: string | null;
  planName: string;
  amountLabel: string;
  renewsOn?: Date | null;
}): Promise<EmailOutcome> {
  const rinnovo = params.renewsOn
    ? new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "Europe/Rome" }).format(
        params.renewsOn
      )
    : null;

  return invia(params.to, `Piano ${params.planName} attivo`, {
    heading: `Il piano ${params.planName} è attivo`,
    greeting: saluto(params.firstName),
    blocks: [
      { text: "Il pagamento è andato a buon fine e le funzioni del piano sono già disponibili." },
      {
        rows: [
          { label: "Piano", value: escapeHtml(params.planName) },
          { label: "Importo", value: escapeHtml(params.amountLabel) },
          ...(rinnovo ? [{ label: "Prossimo rinnovo", value: escapeHtml(rinnovo) }] : []),
        ],
      },
      {
        text: "Ricevute e fatture sono sempre disponibili nella sezione fatturazione, insieme ai dati di pagamento.",
      },
    ],
    cta: { label: "Vedi fatture e ricevute", url: `${SITE_URL}/settings?tab=billing` },
  });
}

export function sendPlanChangedEmail(params: {
  to: string;
  firstName?: string | null;
  previousPlan: string;
  newPlan: string;
  isUpgrade: boolean;
}): Promise<EmailOutcome> {
  return invia(
    params.to,
    params.isUpgrade ? `Sei passato a ${params.newPlan}` : `Piano aggiornato a ${params.newPlan}`,
    {
      heading: params.isUpgrade
        ? `Ora sei su ${params.newPlan}`
        : `Il tuo piano è ora ${params.newPlan}`,
      greeting: saluto(params.firstName),
      blocks: [
        {
          text: params.isUpgrade
            ? `Il passaggio da <strong>${escapeHtml(params.previousPlan)}</strong> a <strong>${escapeHtml(params.newPlan)}</strong> è attivo: i nuovi limiti e le funzioni aggiuntive valgono da subito.`
            : `Il piano è stato aggiornato da <strong>${escapeHtml(params.previousPlan)}</strong> a <strong>${escapeHtml(params.newPlan)}</strong>.`,
        },
        // Detto esplicitamente su un downgrade: i limiti si abbassano, e
        // scoprirlo davanti a un blocco durante una conversazione con un
        // cliente è il modo peggiore.
        ...(params.isUpgrade
          ? []
          : [
              {
                notice: {
                  tone: "warning" as const,
                  text: "I limiti del nuovo piano sono più bassi: controlla i crediti residui prima di avviare nuove conversazioni.",
                },
              },
            ]),
      ],
      cta: { label: "Vedi il tuo piano", url: `${SITE_URL}/settings?tab=billing` },
    }
  );
}

export function sendSubscriptionCancelledEmail(params: {
  to: string;
  firstName?: string | null;
  planName: string;
  activeUntil?: Date | null;
}): Promise<EmailOutcome> {
  const fino = params.activeUntil
    ? new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "Europe/Rome" }).format(
        params.activeUntil
      )
    : null;

  return invia(params.to, "Disdetta registrata", {
    heading: "Abbiamo registrato la disdetta",
    greeting: saluto(params.firstName),
    blocks: [
      {
        text: fino
          ? `Il piano <strong>${escapeHtml(params.planName)}</strong> resta attivo fino al <strong>${escapeHtml(fino)}</strong>. Fino a quel giorno non cambia nulla: crediti, funzioni e dati restano al loro posto.`
          : `Il piano <strong>${escapeHtml(params.planName)}</strong> è stato disdetto.`,
      },
      {
        text: "Dopo quella data l'account passa alle funzioni gratuite. <strong>I lead, gli immobili e i documenti restano nel tuo archivio</strong>: non viene cancellato nulla.",
      },
      {
        notice: {
          tone: "info",
          text: "Puoi riattivare quando vuoi, anche dopo la scadenza: riparti da dove avevi lasciato, senza reinserire nulla.",
        },
      },
    ],
    cta: { label: "Riattiva il piano", url: `${SITE_URL}/settings?tab=billing` },
  });
}

export function sendPaymentFailedEmail(params: {
  to: string;
  firstName?: string | null;
  planName: string;
  amountLabel: string;
  updateUrl?: string | null;
}): Promise<EmailOutcome> {
  return invia(params.to, "Pagamento non riuscito — aggiorna il metodo", {
    heading: "Non siamo riusciti a incassare il rinnovo",
    greeting: saluto(params.firstName),
    blocks: [
      {
        text: `Il pagamento di <strong>${escapeHtml(params.amountLabel)}</strong> per il piano <strong>${escapeHtml(params.planName)}</strong> è stato rifiutato. Succede spesso per una carta scaduta o un massimale.`,
      },
      {
        notice: {
          tone: "danger",
          text: "Riproveremo automaticamente nei prossimi giorni. Se non va a buon fine, le funzioni AI si fermano: l'assistente smette di rispondere ai lead su WhatsApp.",
        },
      },
      { text: "Aggiornare il metodo di pagamento richiede meno di un minuto." },
    ],
    cta: {
      label: "Aggiorna il metodo di pagamento",
      url: params.updateUrl || `${SITE_URL}/settings?tab=billing`,
    },
  });
}

// --- C. Crediti --------------------------------------------------------------

/** Etichette leggibili dei contatori: nell'email non compare mai un nome di campo. */
export const CREDIT_LABELS = {
  whatsapp: "conversazioni WhatsApp",
  documents: "analisi documenti",
  voice: "note vocali",
} as const;

export type CreditKind = keyof typeof CREDIT_LABELS;

export function sendCreditsWarningEmail(params: {
  to: string;
  firstName?: string | null;
  kind: CreditKind;
  used: number;
  limit: number;
  percent: 80 | 90;
}): Promise<EmailOutcome> {
  const cosa = CREDIT_LABELS[params.kind];

  // "l'80%" e non "il 80%": ottanta comincia per vocale. E' il genere di
  // dettaglio che tradisce un'interfaccia tradotta invece che scritta.
  const articolo = params.percent === 80 ? "l'80%" : `il ${params.percent}%`;

  return invia(params.to, `Hai usato ${articolo} delle ${cosa}`, {
    heading: `${cosa.charAt(0).toUpperCase()}${cosa.slice(1)}: sei al ${params.percent}%`,
    greeting: saluto(params.firstName),
    blocks: [
      {
        rows: [
          { label: "Utilizzate", value: `${params.used} su ${params.limit}` },
          { label: "Residue", value: String(Math.max(0, params.limit - params.used)) },
        ],
      },
      {
        text:
          params.percent >= 90
            ? "Al raggiungimento del limite l'assistente <strong>smette di rispondere</strong> ai nuovi messaggi. I lead continuano ad arrivare, ma nessuno risponde finché non aumenti il piano."
            : "Ti avvisiamo adesso perché tu possa decidere con calma, invece di scoprirlo a limite raggiunto.",
      },
    ],
    cta: { label: "Aumenta il piano", url: `${SITE_URL}/settings?tab=billing` },
  });
}

export function sendCreditsExhaustedEmail(params: {
  to: string;
  firstName?: string | null;
  kind: CreditKind;
  limit: number;
}): Promise<EmailOutcome> {
  const cosa = CREDIT_LABELS[params.kind];

  return invia(params.to, `Crediti esauriti: ${cosa}`, {
    heading: `Hai esaurito le ${cosa}`,
    greeting: saluto(params.firstName),
    blocks: [
      {
        notice: {
          tone: "danger",
          text: `Hai raggiunto il limite di ${params.limit} del tuo piano. Da adesso l'assistente non risponde più: i messaggi in arrivo restano in attesa nella scheda del lead.`,
        },
      },
      {
        text: "<strong>Non si perde nulla</strong>: i contatti continuano a entrare in pipeline e le conversazioni riprendono da dove erano rimaste appena il piano è aggiornato o si rinnova il mese.",
      },
    ],
    cta: { label: "Sblocca subito", url: `${SITE_URL}/settings?tab=billing` },
  });
}

// --- D. WhatsApp -------------------------------------------------------------

export function sendWhatsAppDisconnectedEmail(params: {
  to: string;
  firstName?: string | null;
  phoneNumber?: string | null;
}): Promise<EmailOutcome> {
  return invia(params.to, "⚠️ WhatsApp scollegato: i lead non ricevono risposta", {
    heading: "Il tuo numero WhatsApp si è scollegato",
    greeting: saluto(params.firstName),
    blocks: [
      {
        notice: {
          tone: "danger",
          text: "Finché non riconnetti, l'assistente non riceve e non risponde a nessun messaggio. I lead che scrivono adesso non ottengono risposta.",
        },
      },
      {
        text: params.phoneNumber
          ? `La sessione del numero <strong>${escapeHtml(params.phoneNumber)}</strong> è caduta. Succede quando il telefono resta a lungo offline, o se il collegamento è stato revocato da WhatsApp sul dispositivo.`
          : "La sessione WhatsApp è caduta. Succede quando il telefono resta a lungo offline, o se il collegamento è stato revocato da WhatsApp sul dispositivo.",
      },
      { text: "Riconnetterlo richiede una scansione del codice QR: meno di un minuto." },
    ],
    cta: { label: "Riconnetti WhatsApp", url: `${SITE_URL}/leads` },
  });
}

export function sendAiAutoPausedEmail(params: {
  to: string;
  firstName?: string | null;
  clientName: string;
  leadId: string;
}): Promise<EmailOutcome> {
  return invia(params.to, `Assistente in pausa su ${params.clientName}`, {
    heading: "Una conversazione è passata a gestione manuale",
    greeting: saluto(params.firstName),
    blocks: [
      {
        text: `L'assistente ha smesso di rispondere a <strong>${escapeHtml(params.clientName)}</strong>: gli ultimi due messaggi non riguardavano immobili, quindi ha lasciato la conversazione a te invece di insistere con le domande di qualificazione.`,
      },
      {
        notice: {
          tone: "info",
          text: "Se è un contatto vero — un numero nuovo, un messaggio scritto male, un vocale non capito — riattiva l'assistente dalla scheda o scrivi !riprendi nella chat.",
        },
      },
      { text: "I messaggi arrivati nel frattempo sono tutti in scheda: non si è perso nulla." },
    ],
    cta: { label: "Apri la conversazione", url: `${SITE_URL}/leads?lead=${params.leadId}` },
  });
}

// --- E. Password -------------------------------------------------------------

export function sendPasswordResetEmail(params: {
  to: string;
  firstName?: string | null;
  resetUrl: string;
  expiresInMinutes: number;
}): Promise<EmailOutcome> {
  return invia(params.to, "Reimposta la tua password PropertyTech", {
    heading: "Reimposta la password",
    greeting: saluto(params.firstName),
    blocks: [
      {
        text: `Hai chiesto di reimpostare la password del tuo account. Il link qui sotto vale <strong>${params.expiresInMinutes} minuti</strong> e può essere usato una volta sola.`,
      },
      {
        notice: {
          tone: "warning",
          // Detto qui e non in fondo: chi non ha chiesto il reset deve
          // leggerlo prima di arrivare al pulsante.
          text: "Se non sei stato tu a chiederlo, ignora questa email: la password resta quella di prima e nessuno può cambiarla senza aprire questo link.",
        },
      },
    ],
    cta: { label: "Scegli una nuova password", url: params.resetUrl },
  });
}

export function sendPasswordUpdatedEmail(params: {
  to: string;
  firstName?: string | null;
  when: Date;
}): Promise<EmailOutcome> {
  const quando = new Intl.DateTimeFormat("it-IT", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(params.when);

  return invia(params.to, "La tua password è stata cambiata", {
    heading: "Password aggiornata",
    greeting: saluto(params.firstName),
    blocks: [
      { text: `La password del tuo account è stata cambiata il ${escapeHtml(quando)}.` },
      {
        notice: {
          tone: "danger",
          // È l'unica email di questo gruppo che chiede un'azione urgente: se
          // non è stato l'utente, qualcuno ha appena preso il controllo
          // dell'account e ogni minuto conta.
          text: "Se <strong>non</strong> sei stato tu, il tuo account è compromesso: reimposta subito la password e avvisaci.",
        },
      },
    ],
    cta: { label: "Vai al tuo account", url: `${SITE_URL}/login` },
  });
}

// --- F. Team -----------------------------------------------------------------

export function sendInviteAcceptedEmail(params: {
  to: string;
  firstName?: string | null;
  memberName: string;
  memberEmail: string;
}): Promise<EmailOutcome> {
  return invia(params.to, `${params.memberName} è entrato nel team`, {
    heading: "Un collaboratore ha attivato il suo accesso",
    greeting: saluto(params.firstName),
    blocks: [
      {
        text: `<strong>${escapeHtml(params.memberName)}</strong> ha accettato l'invito e ora fa parte del team dell'agenzia.`,
      },
      {
        rows: [
          { label: "Nome", value: escapeHtml(params.memberName) },
          { label: "Email", value: escapeHtml(params.memberEmail) },
        ],
      },
      {
        text: "Da adesso vede i lead che gli assegni e può lavorare sugli immobili in portafoglio. Se l'attivazione non ti risulta, rimuovilo dal team: l'accesso decade subito.",
      },
    ],
    cta: { label: "Gestisci il team", url: `${SITE_URL}/settings?tab=team` },
  });
}

// --- G. Rinnovi --------------------------------------------------------------

export function sendRenewalPaidEmail(params: {
  to: string;
  firstName?: string | null;
  planName: string;
  amountLabel: string;
  periodEnd?: Date | null;
  invoiceUrl?: string | null;
}): Promise<EmailOutcome> {
  const prossimo = params.periodEnd
    ? new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "Europe/Rome" }).format(
        params.periodEnd
      )
    : null;

  return invia(params.to, `Rinnovo ${params.planName} — ricevuta`, {
    heading: "Rinnovo completato",
    greeting: saluto(params.firstName),
    blocks: [
      { text: "Il rinnovo è andato a buon fine e i crediti del nuovo periodo sono già disponibili." },
      {
        rows: [
          { label: "Piano", value: escapeHtml(params.planName) },
          { label: "Addebitato", value: escapeHtml(params.amountLabel) },
          ...(prossimo ? [{ label: "Prossimo rinnovo", value: escapeHtml(prossimo) }] : []),
        ],
      },
    ],
    cta: {
      label: params.invoiceUrl ? "Scarica la ricevuta" : "Vedi le fatture",
      url: params.invoiceUrl || `${SITE_URL}/settings?tab=billing`,
    },
  });
}

// --- H. Lead che richiede attenzione -----------------------------------------

export function sendLeadAttentionRequiredEmail(params: {
  to: string;
  firstName?: string | null;
  clientName: string;
  clientPhone: string;
  leadId: string;
}): Promise<EmailOutcome> {
  return invia(params.to, `⚠️ ${params.clientName} aspetta una risposta`, {
    heading: "Una conversazione si è bloccata",
    greeting: saluto(params.firstName),
    blocks: [
      {
        text: `L'assistente non è riuscito a elaborare l'ultimo messaggio di <strong>${escapeHtml(params.clientName)}</strong> e ha risposto con un messaggio di cortesia: la qualificazione è ferma.`,
      },
      {
        rows: [
          { label: "Contatto", value: escapeHtml(params.clientName) },
          { label: "Telefono", value: escapeHtml(params.clientPhone) },
        ],
      },
      {
        notice: {
          tone: "warning",
          text: "Il cliente ha ricevuto \"un nostro agente la ricontatterà\": adesso si aspetta una persona, e l'attesa è già cominciata.",
        },
      },
    ],
    cta: { label: "Apri la conversazione", url: `${SITE_URL}/leads?lead=${params.leadId}` },
  });
}

// --- I. Abbinamenti immobile ↔ lead ------------------------------------------

export function sendMatchFoundEmail(params: {
  to: string;
  firstName?: string | null;
  clientName: string;
  leadId: string;
  properties: { reference: string; title: string; price: string; score: number }[];
}): Promise<EmailOutcome> {
  const quanti = params.properties.length;

  return invia(
    params.to,
    quanti === 1
      ? `Un immobile per ${params.clientName}`
      : `${quanti} immobili per ${params.clientName}`,
    {
      heading: quanti === 1 ? "Abbiamo un immobile che gli somiglia" : "Immobili compatibili trovati",
      greeting: saluto(params.firstName),
      blocks: [
        {
          text: `<strong>${escapeHtml(params.clientName)}</strong> ha appena completato la qualificazione, e ${quanti === 1 ? "un immobile in portafoglio corrisponde" : `${quanti} immobili in portafoglio corrispondono`} a quello che cerca.`,
        },
        {
          rows: params.properties.map((p) => ({
            label: `${p.reference} — ${p.title}`,
            value: `${p.price} · ${p.score}%`,
          })),
        },
        {
          text: "Il momento in cui un acquirente finisce di raccontare cosa cerca è quello in cui è più disponibile a fissare una visita.",
        },
      ],
      cta: { label: "Apri la scheda del contatto", url: `${SITE_URL}/leads?lead=${params.leadId}` },
    }
  );
}

// --- L. Incarichi in scadenza ------------------------------------------------

export function sendMandatesExpiringEmail(params: {
  to: string;
  firstName?: string | null;
  entro30: { reference: string; title: string; days: number }[];
  entro60: { reference: string; title: string; days: number }[];
  scaduti: { reference: string; title: string }[];
}): Promise<EmailOutcome> {
  const totale = params.entro30.length + params.entro60.length + params.scaduti.length;

  const blocks: EmailLayoutInput["blocks"] = [
    {
      text: `Controllo settimanale degli incarichi: ${totale === 1 ? "una scheda richiede" : `${totale} schede richiedono`} attenzione.`,
    },
  ];

  if (params.scaduti.length > 0) {
    blocks.push({
      notice: {
        tone: "danger",
        text: `<strong>${params.scaduti.length === 1 ? "Un incarico è scaduto" : `${params.scaduti.length} incarichi sono scaduti`}</strong>: gli immobili sono già usciti dal feed verso i portali. Senza mandato valido non si possono pubblicizzare.`,
      },
    });
    blocks.push({ list: params.scaduti.map((p) => `${escapeHtml(p.reference)} — ${escapeHtml(p.title)}`) });
  }

  if (params.entro30.length > 0) {
    blocks.push({
      notice: {
        tone: "warning",
        text: "In scadenza entro 30 giorni: è il momento di parlare del rinnovo con il proprietario.",
      },
    });
    blocks.push({
      rows: params.entro30.map((p) => ({
        label: `${p.reference} — ${p.title}`,
        value: p.days === 0 ? "scade oggi" : p.days === 1 ? "1 giorno" : `${p.days} giorni`,
      })),
    });
  }

  if (params.entro60.length > 0) {
    blocks.push({ text: "<strong>In scadenza entro 60 giorni</strong>" });
    blocks.push({
      rows: params.entro60.map((p) => ({
        label: `${p.reference} — ${p.title}`,
        value: `${p.days} giorni`,
      })),
    });
  }

  return invia(params.to, `Incarichi: ${totale} da controllare`, {
    heading: "Incarichi in scadenza",
    greeting: saluto(params.firstName),
    blocks,
    cta: { label: "Apri il portafoglio", url: `${SITE_URL}/properties` },
  });
}
