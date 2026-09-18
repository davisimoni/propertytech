import "server-only";
import { BRAND } from "@/lib/brand";
import { SITE_URL } from "@/lib/seo";

/**
 * Impaginazione condivisa delle email: di servizio e newsletter.
 *
 * # Perché HTML a mano e non React Email
 *
 * React Email è una bella libreria, ma qui aggiungerebbe una dipendenza e un
 * passaggio di render per produrre esattamente quello che c'è sotto: tabelle e
 * stili in linea. Il vincolo non viene da noi, viene dai client di posta —
 * Outlook ignora `display` sui link, Gmail rimuove i fogli di stile, nessuno
 * applica le media query in modo affidabile — e nessuna libreria lo aggira: lo
 * incapsula soltanto.
 *
 * # Chiaro e non scuro
 *
 * Il prodotto ha un tema scuro, ma un'email con fondo scuro arriva illeggibile
 * su metà dei client: Gmail su Android inverte i colori di sua iniziativa,
 * Outlook desktop non applica `background` alle tabelle annidate, e il testo
 * bianco su fondo bianco è il risultato più comune. Fondo chiaro con accento
 * di brand è la scelta che sopravvive dappertutto.
 *
 * # Stesso aspetto, due piè di pagina
 *
 * Newsletter e email di servizio condividono impaginazione e tono, ma non il
 * piè di pagina: solo la newsletter porta la disiscrizione (vedi
 * `EmailFooter`).
 */

const ACCENT = "#0066FF";
const NAVY = "#031735";
const TESTO = "#0f172a";
const TESTO_TENUE = "#64748b";
const BORDO = "#e2e8f0";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface EmailBlock {
  /** Titolo di sezione, per i testi lunghi della newsletter. */
  subheading?: string;
  /** Paragrafo di testo. */
  text?: string;
  /** Elenco puntato. */
  list?: string[];
  /** Riquadro con coppie etichetta/valore, per riepiloghi. */
  rows?: { label: string; value: string }[];
  /** Riquadro di avviso: giallo per un'attenzione, rosso per un blocco. */
  notice?: { tone: "warning" | "danger" | "info"; text: string };
}

/**
 * Riquadro promozionale della newsletter: vantaggi del piano successivo.
 *
 * Solo nella newsletter, mai in un'email di servizio: chi riceve "Pagamento
 * non riuscito" non deve trovarci sotto un'offerta.
 */
export interface EmailUpsell {
  title: string;
  intro: string;
  items: string[];
  cta: { label: string; url: string };
}

/**
 * Piè di pagina: cosa è questa email e cosa può farne il destinatario.
 *
 * - `servizio`: email dell'account, non revocabili. Lo dice esplicitamente,
 *   così nessuno cerca di disattivarle credendole promozionali.
 * - `newsletter`: porta il link di disiscrizione e rimanda alle preferenze.
 */
export type EmailFooter =
  | { tipo: "servizio" }
  | { tipo: "newsletter"; unsubscribeUrl: string; preferencesUrl: string };

export interface EmailLayoutInput {
  /** Titolo grande in cima al corpo. */
  heading: string;
  /**
   * Anteprima mostrata dai client dopo l'oggetto. Senza, la maggior parte dei
   * client mostra il primo testo che trova: il marchio dell'intestazione.
   */
  preheader?: string;
  /** Riga di apertura, es. "Buongiorno Marco,". */
  greeting?: string;
  blocks: EmailBlock[];
  cta?: { label: string; url: string };
  /** Chiusura sotto la CTA, es. un avviso di sicurezza. */
  footnote?: string;
  /** Solo newsletter: riquadro dei vantaggi del piano successivo. */
  upsell?: EmailUpsell;
  /** Predefinito `servizio`. */
  footer?: EmailFooter;
}

const NOTICE_STYLE: Record<NonNullable<EmailBlock["notice"]>["tone"], string> = {
  info: `background:#eff6ff;border-left:3px solid ${ACCENT};color:${TESTO};`,
  warning: "background:#fffbeb;border-left:3px solid #F59E0B;color:#78350f;",
  danger: "background:#fef2f2;border-left:3px solid #EF4444;color:#7f1d1d;",
};

function renderBlock(block: EmailBlock): string {
  if (block.subheading) {
    return `<h2 style="margin:20px 0 8px;font-size:15px;line-height:1.4;font-weight:700;color:${TESTO};">${escapeHtml(block.subheading)}</h2>`;
  }

  if (block.text) {
    return `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${TESTO_TENUE};">${block.text}</p>`;
  }

  if (block.list?.length) {
    const voci = block.list
      .map(
        (voce) =>
          `<li style="margin:0 0 6px;font-size:14px;line-height:1.6;color:${TESTO_TENUE};">${voce}</li>`
      )
      .join("");
    return `<ul style="margin:0 0 16px;padding-left:20px;">${voci}</ul>`;
  }

  if (block.rows?.length) {
    const righe = block.rows
      .map(
        (riga) => `<tr>
          <td style="padding:6px 0;font-size:13px;color:${TESTO_TENUE};">${riga.label}</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;color:${TESTO};text-align:right;">${riga.value}</td>
        </tr>`
      )
      .join("");
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid ${BORDO};border-radius:8px;padding:8px 14px;">${righe}</table>`;
  }

  if (block.notice) {
    return `<p style="margin:0 0 16px;padding:12px 14px;border-radius:6px;font-size:13px;line-height:1.6;${NOTICE_STYLE[block.notice.tone]}">${block.notice.text}</p>`;
  }

  return "";
}

function renderUpsell(upsell: EmailUpsell): string {
  const voci = upsell.items
    .map(
      (voce) =>
        `<li style="margin:0 0 4px;font-size:13px;line-height:1.5;color:${TESTO};">${voce}</li>`
    )
    .join("");

  return `<tr><td style="padding:0 28px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
        <tr><td style="padding:18px 20px;">
          <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:${NAVY};">${escapeHtml(upsell.title)}</p>
          <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:${TESTO_TENUE};">${upsell.intro}</p>
          <ul style="margin:0 0 14px;padding-left:18px;">${voci}</ul>
          <a href="${upsell.cta.url}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:${NAVY};font-size:13px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(upsell.cta.label)}</a>
        </td></tr>
      </table>
    </td></tr>`;
}

function renderFooter(footer: EmailFooter): string {
  if (footer.tipo === "newsletter") {
    return `<p style="margin:0 0 6px;font-size:11px;line-height:1.6;color:${TESTO_TENUE};">
        ${BRAND.name} · ${BRAND.tagline} · P.IVA ${BRAND.vatNumber}<br />
        Ricevi la newsletter di ${BRAND.name} perché utilizzi la piattaforma. Puoi interromperla in qualsiasi momento: le email di servizio sul tuo account continueranno ad arrivare.
      </p>
      <p style="margin:0;font-size:11px;color:${TESTO_TENUE};">
        <a href="${footer.unsubscribeUrl}" style="color:${TESTO_TENUE};">Annulla l'iscrizione</a>
        &nbsp;·&nbsp;
        <a href="${footer.preferencesUrl}" style="color:${TESTO_TENUE};">Preferenze email</a>
        &nbsp;·&nbsp;
        <a href="${SITE_URL}/privacy" style="color:${TESTO_TENUE};">Privacy</a>
      </p>`;
  }

  return `<p style="margin:0 0 6px;font-size:11px;line-height:1.6;color:${TESTO_TENUE};">
        ${BRAND.name} · ${BRAND.tagline}<br />
        Comunicazione di servizio relativa al tuo account ${BRAND.name}. Viene inviata a prescindere dalle preferenze sulla newsletter.
      </p>
      <p style="margin:0;font-size:11px;color:${TESTO_TENUE};">
        <a href="${SITE_URL}/privacy" style="color:${TESTO_TENUE};">Privacy</a>
        &nbsp;·&nbsp;
        <a href="mailto:${BRAND.supportEmail}" style="color:${TESTO_TENUE};">${BRAND.supportEmail}</a>
      </p>`;
}

/** Compone l'email completa. */
export function renderEmail(input: EmailLayoutInput): string {
  const corpo = input.blocks.map(renderBlock).join("");

  // Testo nascosto letto dai client come anteprima. Gli spazi finali tengono
  // lontano il resto del corpo, che altrimenti si accoda nell'anteprima.
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}${"&#847;&zwnj;&nbsp;".repeat(30)}</div>`
    : "";

  const saluto = input.greeting
    ? `<p style="margin:0 0 12px;font-size:14px;color:${TESTO};">${input.greeting}</p>`
    : "";

  const cta = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
        <tr><td style="border-radius:8px;background:${ACCENT};">
          <a href="${input.cta.url}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(input.cta.label)}</a>
        </td></tr>
      </table>
      <p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:${TESTO_TENUE};">
        Se il pulsante non funziona: <a href="${input.cta.url}" style="color:${ACCENT};">${escapeHtml(input.cta.url)}</a>
      </p>`
    : "";

  const nota = input.footnote
    ? `<p style="margin:0;font-size:12px;line-height:1.6;color:${TESTO_TENUE};">${input.footnote}</p>`
    : "";

  return `<!doctype html>
<html lang="it">
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${preheader}
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${BORDO};border-radius:12px;overflow:hidden;">
    <tr><td style="padding:20px 28px;background:${NAVY};">
      <span style="font-size:17px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">
        ${BRAND.nameParts.primary}<span style="color:#00C8FF;">${BRAND.nameParts.accent}</span>
      </span>
    </td></tr>

    <tr><td style="padding:28px;">
      <h1 style="margin:0 0 16px;font-size:19px;line-height:1.3;font-weight:700;color:${TESTO};">${escapeHtml(input.heading)}</h1>
      ${saluto}
      ${corpo}
      ${cta}
      ${nota}
    </td></tr>

    ${input.upsell ? renderUpsell(input.upsell) : ""}

    <tr><td style="padding:18px 28px;border-top:1px solid ${BORDO};background:#f8fafc;">
      ${renderFooter(input.footer ?? { tipo: "servizio" })}
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Versione testuale, generata dagli stessi blocchi.
 *
 * Non è un ripiego: è quello che leggono i client che l'HTML non lo mostrano,
 * ed è anche ciò che i filtri antispam valutano. Un'email con il solo HTML
 * parte con una penalizzazione.
 */
export function renderEmailText(input: EmailLayoutInput): string {
  const righe: string[] = [input.heading, ""];

  if (input.greeting) righe.push(input.greeting, "");

  for (const block of input.blocks) {
    if (block.subheading) righe.push(block.subheading.toUpperCase(), "");
    if (block.text) righe.push(stripTags(block.text), "");
    if (block.list?.length) righe.push(...block.list.map((v) => `- ${stripTags(v)}`), "");
    if (block.rows?.length)
      righe.push(...block.rows.map((r) => `${r.label}: ${stripTags(r.value)}`), "");
    if (block.notice) righe.push(stripTags(block.notice.text), "");
  }

  if (input.cta) righe.push(`${input.cta.label}: ${input.cta.url}`, "");
  if (input.footnote) righe.push(stripTags(input.footnote), "");

  if (input.upsell) {
    righe.push(
      "--",
      input.upsell.title,
      stripTags(input.upsell.intro),
      ...input.upsell.items.map((v) => `- ${stripTags(v)}`),
      `${input.upsell.cta.label}: ${input.upsell.cta.url}`,
      ""
    );
  }

  righe.push("--", `${BRAND.name} · ${BRAND.tagline}`, `${SITE_URL}`);

  const footer = input.footer ?? { tipo: "servizio" };
  if (footer.tipo === "newsletter") {
    righe.push(
      "",
      "Ricevi la newsletter perché utilizzi la piattaforma.",
      `Annulla l'iscrizione: ${footer.unsubscribeUrl}`,
      `Preferenze email: ${footer.preferencesUrl}`
    );
  } else {
    righe.push("", "Comunicazione di servizio relativa al tuo account.");
  }

  return righe.join("\n");
}

/** I blocchi possono contenere `<strong>`: nel testo semplice va via. */
function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}
