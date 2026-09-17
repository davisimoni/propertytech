/**
 * Iscrizione push di QUESTO dispositivo, lato browser.
 *
 * # Perché ricordare l'endpoint
 *
 * Quando l'utente blocca le notifiche dalle impostazioni del browser, o ne
 * cancella i dati, il browser annulla l'iscrizione in silenzio: la pagina non
 * riceve nessun evento e `getSubscription()` restituisce semplicemente `null`.
 * Senza sapere quale endpoint c'era, il server lo scoprirebbe solo al primo
 * invio fallito (410), e fino ad allora conserverebbe l'indirizzo di un
 * dispositivo che ha revocato il consenso. Ricordandolo qui, la riga si
 * elimina alla prima apertura dell'app dopo la revoca.
 *
 * `auth` viaggia con l'endpoint perché è la prova di possesso che permette la
 * rimozione anche senza sessione (dopo un logout, o dal service worker): solo
 * il dispositivo iscritto la conosce.
 *
 * Solo browser: da importare in componenti client.
 */

const CHIAVE = "pt-push-iscrizione";

interface IscrizioneRicordata {
  endpoint: string;
  auth: string;
}

function leggi(): IscrizioneRicordata | null {
  try {
    const valore = window.localStorage.getItem(CHIAVE);
    return valore ? (JSON.parse(valore) as IscrizioneRicordata) : null;
  } catch {
    return null;
  }
}

function dimentica(): void {
  try {
    window.localStorage.removeItem(CHIAVE);
  } catch {
    // Storage non disponibile: al peggio la rimozione arriva col primo 410.
  }
}

export function ricordaIscrizione(iscrizione: PushSubscription): void {
  const auth = iscrizione.toJSON().keys?.auth;
  if (!auth) return;
  try {
    window.localStorage.setItem(CHIAVE, JSON.stringify({ endpoint: iscrizione.endpoint, auth }));
  } catch {
    // Vedi `dimentica`.
  }
}

async function rimuoviSulServer(endpoint: string, auth: string): Promise<boolean> {
  try {
    const risposta = await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, keys: { auth } }),
      keepalive: true,
    });
    return risposta.ok;
  } catch {
    return false;
  }
}

async function iscrizioneCorrente(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registrazione = await navigator.serviceWorker.getRegistration("/");
  return (await registrazione?.pushManager.getSubscription()) ?? null;
}

/**
 * Allinea il server a una revoca fatta fuori dall'app.
 *
 * Se questo dispositivo era iscritto e ora non lo è più — permesso tolto,
 * iscrizione annullata dal browser o sostituita da una nuova — l'endpoint
 * ricordato si rimuove dal server.
 */
export async function sincronizzaRevoca(): Promise<void> {
  const ricordata = leggi();
  if (!ricordata) return;

  const permesso = "Notification" in window ? Notification.permission : "denied";
  const attuale = await iscrizioneCorrente().catch(() => null);

  const revocata = permesso !== "granted" || !attuale || attuale.endpoint !== ricordata.endpoint;
  if (!revocata) return;

  if (await rimuoviSulServer(ricordata.endpoint, ricordata.auth)) {
    dimentica();
  }
  if (attuale && permesso === "granted") ricordaIscrizione(attuale);
}

/**
 * Annulla l'iscrizione di questo dispositivo: sul server e nel browser.
 *
 * Usata dall'interruttore in Impostazioni e dal logout: dopo l'uscita un
 * telefono condiviso non deve continuare a mostrare sullo schermo di blocco i
 * nomi dei clienti dell'utente che è uscito.
 */
export async function revocaIscrizioneDispositivo(): Promise<void> {
  const attuale = await iscrizioneCorrente().catch(() => null);
  const ricordata = leggi();

  const endpoint = attuale?.endpoint ?? ricordata?.endpoint;
  const auth = attuale?.toJSON().keys?.auth ?? ricordata?.auth;

  if (endpoint && auth) await rimuoviSulServer(endpoint, auth);
  if (attuale) await attuale.unsubscribe().catch(() => undefined);
  dimentica();
}
