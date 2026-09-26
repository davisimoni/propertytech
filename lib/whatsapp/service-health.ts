import "server-only";
import { prisma } from "@/lib/prisma";
import { readSecret } from "@/lib/env";
import { reportWebhookError } from "@/lib/observability/report-error";

/**
 * Controllo di vitalità del microservizio che tiene aperti i socket WhatsApp.
 *
 * # Il buco che chiude
 *
 * Tutti gli avvisi sulle sessioni arrivano **dal** microservizio: la caduta di
 * un socket, la sessione che non si riaggancia. È una catena che funziona
 * finché il microservizio è vivo, e si interrompe proprio quando smette di
 * esserlo — se Render cade, nessuno emette niente e in piattaforma ogni
 * agenzia continua a risultare collegata. Il silenzio non si distingue dal
 * funzionamento normale, ed è il guasto peggiore: ogni cliente che scrive non
 * riceve risposta, per ore, senza che una riga lo dica da nessuna parte.
 *
 * Questo controllo guarda da fuori, dalla piattaforma, che è l'unico punto da
 * cui si può vedere l'assenza di qualcuno.
 *
 * # Due guasti, non uno
 *
 * `/health` risponde `{ ok, sessions }`, dove `sessions` sono i socket vivi in
 * quel momento. Confrontarlo con quante agenzie risultano collegate a
 * database prende anche il secondo caso: servizio in piedi che risponde, ma
 * con meno sessioni di quante dovrebbe averne. È quello che succedeva a ogni
 * riavvio prima del ripristino automatico, ed è il più insidioso dei due
 * perché il servizio risulta "Live" in dashboard.
 *
 * # A chi va l'avviso, e perché non alle agenzie
 *
 * A noi: Sentry e log. Un guasto del microservizio le riguarda tutte insieme,
 * e mandare un'email a ognuna significherebbe far arrivare a venti titolari
 * un allarme identico su una cosa che non possono risolvere — e che quasi
 * sempre rientra da sola. È lo stesso errore dell'email al primo singhiozzo,
 * moltiplicato per il numero di clienti.
 */

/** Quanto si aspetta una risposta da `/health` prima di considerarla persa. */
const TIMEOUT_MS = 10_000;

/** Pausa fra il primo tentativo e il secondo. */
const PAUSA_RITENTATIVO_MS = 3_000;

export interface EsitoVitalita {
  /** `false` quando il microservizio non è configurato su questo ambiente. */
  configurato: boolean;
  /** `null` quando non si è nemmeno provato. */
  raggiungibile: boolean | null;
  /** Agenzie che risultano collegate via QR secondo il database. */
  agenzieCollegate: number;
  /** Sessioni che il servizio sa di dover tenere su. `null` se non ha risposto. */
  sessioniNote: number | null;
  /** Di quelle, quante stanno parlando adesso. Per i log, non per l'allarme. */
  sessioniConnesse: number | null;
  /** Cosa è stato segnalato, se qualcosa. */
  allarme: "servizio-irraggiungibile" | "sessioni-mancanti" | null;
}

/** Una sola interrogazione a `/health`, senza credenziali: è esposta prima dell'auth. */
async function interroga(
  baseUrl: string
): Promise<{ note: number; connesse: number } | null> {
  try {
    const risposta = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!risposta.ok) return null;

    const corpo = (await risposta.json().catch(() => null)) as {
      note?: number;
      connesse?: number;
      sessions?: number;
    } | null;

    if (!corpo) return null;

    /*
     * `note` e non `sessions`, ed è la differenza fra un controllo utile e uno
     * che grida al lupo.
     *
     * `sessions` conta le voci vive **in quell'istante**: fra una caduta e il
     * tentativo successivo la voce viene rimossa, quindi durante una normale
     * riconnessione il numero scende. Confrontarlo con il database farebbe
     * scattare un allarme ogni volta che una sessione sta rientrando da sola,
     * cioè nel caso più frequente e meno grave.
     *
     * `note` conta quelle che il servizio **sa** di dover tenere su, e cambia
     * solo quando un'agenzia si abbina o si stacca. Il ripiego su `sessions` è
     * per i servizi non ancora aggiornati: meglio un numero impreciso che
     * nessun controllo.
     */
    return {
      note: typeof corpo.note === "number" ? corpo.note : (corpo.sessions ?? 0),
      connesse: typeof corpo.connesse === "number" ? corpo.connesse : (corpo.sessions ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * Interroga il microservizio e segnala se qualcosa non torna. Non lancia mai.
 *
 * Due tentativi e non uno: fra Vercel e Render c'è una rete, e un singolo
 * `fetch` perso non è un guasto — è esattamente il tipo di falso allarme che
 * insegna a ignorare gli allarmi.
 */
export async function verificaVitalitaServizio(): Promise<EsitoVitalita> {
  const baseUrl = readSecret("WHATSAPP_SERVICE_URL");

  // Ambienti dove il collegamento via QR non è previsto (anteprime, locale):
  // non c'è niente da sorvegliare e un allarme sarebbe rumore.
  if (!baseUrl) {
    return {
      configurato: false,
      raggiungibile: null,
      agenzieCollegate: 0,
      sessioniNote: null,
      sessioniConnesse: null,
      allarme: null,
    };
  }

  const agenzieCollegate = await prisma.whatsAppConfig.count({
    where: { provider: "qr", isConnected: true },
  });

  let salute = await interroga(baseUrl);
  if (!salute) {
    await new Promise((r) => setTimeout(r, PAUSA_RITENTATIVO_MS));
    salute = await interroga(baseUrl);
  }

  if (!salute) {
    /*
     * Irraggiungibile. Si segnala **solo se c'è qualcosa in ballo**: un
     * servizio spento senza agenzie collegate è una situazione legittima —
     * nessuno lo sta usando — e svegliare qualcuno per quella è il modo di
     * far disattivare gli avvisi.
     */
    if (agenzieCollegate > 0) {
      console.error("[WA-SERVICE-DOWN]", {
        agenzieCollegate,
        nota: "il microservizio non risponde: le sessioni risultano collegate ma non lo sono",
      });
      reportWebhookError(
        new Error(
          `Microservizio WhatsApp irraggiungibile con ${agenzieCollegate} agenzie collegate`
        ),
        "whatsapp-qr",
        "servizio-irraggiungibile"
      );
    } else {
      console.warn("[WA-SERVICE-DOWN] microservizio non raggiungibile, ma nessuna agenzia collegata");
    }

    return {
      configurato: true,
      raggiungibile: false,
      agenzieCollegate,
      sessioniNote: null,
      sessioniConnesse: null,
      allarme: agenzieCollegate > 0 ? "servizio-irraggiungibile" : null,
    };
  }

  /*
   * Risponde, ma non sa di dover tenere su tutte le sessioni che il database
   * dà per collegate.
   *
   * È il guasto silenzioso: il servizio risulta "Live" in dashboard, risponde
   * a `/health`, e intanto per alcune agenzie non c'è nessun socket né nessun
   * tentativo in corso. Succedeva a ogni riavvio prima del ripristino
   * automatico, e nessuno se ne accorgeva finché un cliente non si lamentava.
   *
   * Il confronto è `<` e non `!==`: il servizio può conoscere sessioni che il
   * database non conta ancora — un abbinamento appena iniziato — e quelle non
   * sono un guasto. Manca qualcosa solo quando ne conosce MENO delle agenzie
   * che credono di essere online.
   */
  if (salute.note < agenzieCollegate) {
    console.error("[WA-SERVICE-SESSIONI-MANCANTI]", {
      agenzieCollegate,
      sessioniNote: salute.note,
      sessioniConnesse: salute.connesse,
      nota: "il servizio risponde ma non sa di dover tenere su tutte le sessioni",
    });
    reportWebhookError(
      new Error(
        `Microservizio WhatsApp: ${salute.note} sessioni note su ${agenzieCollegate} agenzie collegate`
      ),
      "whatsapp-qr",
      "sessioni-mancanti"
    );

    return {
      configurato: true,
      raggiungibile: true,
      agenzieCollegate,
      sessioniNote: salute.note,
      sessioniConnesse: salute.connesse,
      allarme: "sessioni-mancanti",
    };
  }

  return {
    configurato: true,
    raggiungibile: true,
    agenzieCollegate,
    sessioniNote: salute.note,
    sessioniConnesse: salute.connesse,
    allarme: null,
  };
}
