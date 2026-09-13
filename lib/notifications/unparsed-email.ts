import "server-only";
import { SITE_URL } from "@/lib/seo";
import { sendEmail } from "./email";
import { resolveOwner } from "@/lib/email/recipients";

/**
 * Avviso quando una richiesta arriva ma non è riconoscibile.
 *
 * # Perché esiste
 *
 * Perché il silenzio era il difetto peggiore di tutta la catena: se né le
 * regole né il modello trovano un recapito, la rotta rispondeva 200 e scriveva
 * una riga di log. L'agenzia non sapeva nulla — e una richiesta di un cliente
 * vero spariva senza che nessuno potesse accorgersene.
 *
 * # Perché non si allega l'email
 *
 * Perché il destinatario è il titolare dell'agenzia, che quella email ce l'ha
 * già nella propria casella: è lui che ce l'ha inoltrata. Rimandargliela
 * significherebbe far transitare per la nostra infrastruttura il contenuto di
 * una richiesta di terzi senza motivo. Si dice cosa è successo e dove
 * guardare; il contenuto resta dov'è sempre stato.
 */

function buildBody(recipientName: string, mittente: string, oggetto: string): string {
  return [
    recipientName ? `Ciao ${recipientName},` : "Ciao,",
    "",
    "è arrivata una richiesta all'indirizzo di inoltro, ma non siamo riusciti a",
    "ricavarne un recapito telefonico: non è stata creata nessuna scheda e",
    "l'assistente non ha scritto a nessuno.",
    "",
    `Mittente: ${mittente || "non indicato"}`,
    `Oggetto:  ${oggetto || "non indicato"}`,
    "",
    "La trovi nella casella da cui parte l'inoltro: aprila e ricontatta tu il",
    "cliente, oppure inserisci la scheda a mano dalla pipeline.",
    "",
    `Pipeline lead: ${SITE_URL}/leads`,
    "",
    "Se succede spesso con lo stesso portale, scrivici: possiamo insegnare al",
    "sistema a leggere quel formato.",
    "",
    "— PropertyTech",
  ].join("\n");
}

/**
 * Avvisa il titolare. Non lancia mai: è un effetto collaterale del webhook,
 * e un guasto qui non deve cambiarne l'esito.
 */
export async function notifyUnparsedEmail(params: {
  organizationId: string;
  from: string;
  subject: string;
}): Promise<void> {
  try {
    const recipient = await resolveOwner(params.organizationId);

    if (!recipient) {
      console.warn("[notifications/unparsed-email] Nessun destinatario verificato", {
        organizationId: params.organizationId,
      });
      return;
    }

    const outcome = await sendEmail({
      to: recipient.email,
      subject: "Richiesta ricevuta ma non riconosciuta",
      text: buildBody(recipient.firstName ?? "", params.from, params.subject),
    });

    console.info("[UNPARSED-EMAIL-NOTIFY]", { organizationId: params.organizationId, outcome });
  } catch (error) {
    console.error("[notifications/unparsed-email] Avviso non inviato", {
      organizationId: params.organizationId,
      error,
    });
  }
}
