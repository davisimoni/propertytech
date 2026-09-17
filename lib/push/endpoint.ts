/**
 * Quali endpoint push accettiamo.
 *
 * # Perché una lista di host e non "qualsiasi https"
 *
 * Perché l'endpoint lo manda il browser, cioè un client che non controlliamo,
 * e a quell'indirizzo il nostro server farà una POST a ogni notifica. Un
 * endpoint arbitrario trasformerebbe l'iscrizione in un modo per far chiamare
 * al server indirizzi interni o di terzi (SSRF). I servizi push dei browser
 * sono pochi e noti; un browser nuovo che ne usi un altro si aggiunge qui.
 *
 * Il confronto è sul suffisso con il punto: `fcm.googleapis.com.evil.test` non
 * passa.
 */
const HOST_AMMESSI = [
  "fcm.googleapis.com", // Chrome, Opera, Samsung Internet, Chrome Android
  "android.googleapis.com", // endpoint FCM storici
  "push.services.mozilla.com", // Firefox
  "push.apple.com", // Safari (macOS, iOS/iPadOS da schermata Home)
  "notify.windows.com", // Edge
];

export function isEndpointPushAmmesso(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;

  const host = url.hostname.toLowerCase();
  return HOST_AMMESSI.some((ammesso) => host === ammesso || host.endsWith(`.${ammesso}`));
}
