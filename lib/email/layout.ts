import "server-only";
import { BRAND } from "@/lib/brand";
import { SITE_URL } from "@/lib/seo";

/**
 * Impaginazione condivisa delle email transazionali.
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
  /** Paragrafo di testo. */
  text?: string;
  /** Elenco puntato. */
  list?: string[];
  /** Riquadro con coppie etichetta/valore, per riepiloghi. */
  rows?: { label: string; value: string }[];
  /** Riquadro di avviso: giallo per un'attenzione, rosso per un blocco. */
  notice?: { tone: "warning" | "danger" | "info"; text: string };
}

export interface EmailLayoutInput {
  /** Titolo grande in cima al corpo. */
  heading: string;
  /** Riga di apertura, es. "Ciao Marco,". */
  greeting?: string;
  blocks: EmailBlock[];
  cta?: { label: string; url: string };
  /** Chiusura sotto la CTA, es. un avviso di sicurezza. */
  footnote?: string;
}

const NOTICE_STYLE: Record<NonNullable<EmailBlock["notice"]>["tone"], string> = {
  info: `background:#eff6ff;border-left:3px solid ${ACCENT};color:${TESTO};`,
  warning: "background:#fffbeb;border-left:3px solid #F59E0B;color:#78350f;",
  danger: "background:#fef2f2;border-left:3px solid #EF4444;color:#7f1d1d;",
};

function renderBlock(block: EmailBlock): string {
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

/**
 * Compone l'email completa.
 *
 * Il footer porta il recapito dell'agenzia e il link alla gestione delle
 * notifiche: sono email di servizio e non marketing — non richiedono un
 * opt-out per legge — ma dare comunque la strada per regolarle è la differenza
 * fra un fornitore e uno che invade la casella.
 */
export function renderEmail(input: EmailLayoutInput): string {
  const corpo = input.blocks.map(renderBlock).join("");

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

    <tr><td style="padding:18px 28px;border-top:1px solid ${BORDO};background:#f8fafc;">
      <p style="margin:0 0 6px;font-size:11px;line-height:1.6;color:${TESTO_TENUE};">
        ${BRAND.name} — ${BRAND.tagline}<br />
        Ricevi questa email perché hai un account su ${BRAND.name}.
      </p>
      <p style="margin:0;font-size:11px;color:${TESTO_TENUE};">
        <a href="${SITE_URL}/settings" style="color:${TESTO_TENUE};">Gestisci le notifiche</a>
        &nbsp;·&nbsp;
        <a href="${SITE_URL}/privacy" style="color:${TESTO_TENUE};">Privacy</a>
        &nbsp;·&nbsp;
        <a href="mailto:${BRAND.supportEmail}" style="color:${TESTO_TENUE};">${BRAND.supportEmail}</a>
      </p>
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
    if (block.text) righe.push(stripTags(block.text), "");
    if (block.list?.length) righe.push(...block.list.map((v) => `- ${stripTags(v)}`), "");
    if (block.rows?.length)
      righe.push(...block.rows.map((r) => `${r.label}: ${stripTags(r.value)}`), "");
    if (block.notice) righe.push(stripTags(block.notice.text), "");
  }

  if (input.cta) righe.push(`${input.cta.label}: ${input.cta.url}`, "");
  if (input.footnote) righe.push(stripTags(input.footnote), "");

  righe.push("—", `${BRAND.name} — ${BRAND.tagline}`, `${SITE_URL}`);

  return righe.join("\n");
}

/** I blocchi possono contenere `<strong>`: nel testo semplice va via. */
function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}
