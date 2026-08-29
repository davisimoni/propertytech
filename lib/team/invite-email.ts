import "server-only";
import { sendEmail, type EmailOutcome } from "@/lib/notifications/email";

/**
 * Email di invito a un collaboratore.
 *
 * Sostituisce il link da copiare e incollare a mano. Il gesto precedente
 * funzionava, ma scaricava sul titolare un passaggio che il software può fare
 * da sé — e ogni passaggio manuale è un punto in cui l'invito resta negli
 * appunti e non parte mai.
 *
 * # Il token viaggia solo qui
 *
 * Nel database c'è la sola impronta dell'invito, non ricostruibile. Il valore
 * in chiaro esiste per il tempo di questa email: è il motivo per cui un invito
 * non si può "rileggere", si può solo **rigenerare**.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Corpo HTML dell'invito.
 *
 * Stili in linea e tabella per il pulsante: i client di posta non applicano né
 * fogli di stile esterni né buona parte del CSS moderno, e Outlook in
 * particolare ignora `display` sui link. Un "pulsante" costruito con un div
 * flex arriverebbe come testo nudo.
 *
 * Il link compare **anche in chiaro** sotto al pulsante: chi apre l'email da
 * un client che blocca i contenuti, o da un telefono aziendale con regole
 * restrittive, deve poterlo copiare invece di restare bloccato.
 */
function buildHtml(agencyName: string, inviteUrl: string, inviterName: string): string {
  const agenzia = escapeHtml(agencyName);
  const url = escapeHtml(inviteUrl);
  const invitante = inviterName ? escapeHtml(inviterName) : null;

  return `<!doctype html>
<html lang="it">
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
    <tr><td style="padding:28px;">
      <p style="margin:0 0 16px;font-size:16px;font-weight:600;">Ti hanno invitato in ${agenzia} su PropertyTech</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">
        ${invitante ? `${invitante} ti ha` : "Sei stato"} aggiunto come collaboratore.
        Crea la tua password per accedere ai lead, agli immobili e all'agenda dell'agenzia.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
        <tr><td style="border-radius:8px;background:#0066FF;">
          <a href="${url}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
            Attiva il tuo accesso
          </a>
        </td></tr>
      </table>
      <p style="margin:0 0 6px;font-size:12px;color:#64748b;">
        Se il pulsante non funziona, copia questo indirizzo nel browser:
      </p>
      <p style="margin:0 0 20px;font-size:12px;word-break:break-all;">
        <a href="${url}" style="color:#0066FF;">${url}</a>
      </p>
      <p style="margin:0;font-size:12px;color:#64748b;">
        L'invito vale 7 giorni. Se non ti aspettavi questa email, puoi ignorarla: senza aprire il
        link non viene creato alcun accesso.
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildText(agencyName: string, inviteUrl: string, inviterName: string): string {
  return [
    `Ti hanno invitato in ${agencyName} su PropertyTech.`,
    "",
    inviterName
      ? `${inviterName} ti ha aggiunto come collaboratore.`
      : "Sei stato aggiunto come collaboratore.",
    "Crea la tua password per accedere ai lead, agli immobili e all'agenda dell'agenzia:",
    "",
    inviteUrl,
    "",
    "L'invito vale 7 giorni. Se non ti aspettavi questa email puoi ignorarla:",
    "senza aprire il link non viene creato alcun accesso.",
  ].join("\n");
}

/**
 * Spedisce l'invito. Non lancia: l'esito torna come valore.
 *
 * Chi chiama ha appena creato una riga nel database, e deve poter decidere
 * cosa dire all'utente — non trovarsi un'eccezione che annulla un invito già
 * valido.
 */
export async function sendInviteEmail(params: {
  to: string;
  agencyName: string;
  inviteUrl: string;
  inviterName?: string | null;
}): Promise<EmailOutcome> {
  const inviterName = params.inviterName?.trim() ?? "";

  return sendEmail({
    to: params.to,
    subject: `Invito a collaborare in ${params.agencyName} su PropertyTech`,
    text: buildText(params.agencyName, params.inviteUrl, inviterName),
    html: buildHtml(params.agencyName, params.inviteUrl, inviterName),
  });
}
