/**
 * Riconoscimento dei segreti non ancora configurati.
 *
 * `.env.local` viene distribuito con dei segnaposto (`INCOLLA_QUI_...`,
 * `sk_test_...`) che sono stringhe truthy: un controllo di sola presenza li
 * accetterebbe, e la funzione corrispondente fallirebbe solo al primo utilizzo
 * reale — un pulsante Google che porta a una pagina d'errore, o Stripe che
 * sembra attivo e poi rifiuta il pagamento.
 *
 * Questa funzione è l'unico punto in cui è definito cosa conta come
 * "configurato": tenerla duplicata nei singoli moduli ha già prodotto due
 * rilevamenti divergenti quando il formato dei segnaposto è cambiato.
 */

const PLACEHOLDER_PREFIXES = ["INCOLLA_QUI", "NON_LETTO_DALL_APP", "YOUR_", "CHANGE_ME", "TODO"];

export function isConfiguredSecret(value: string | undefined | null): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;

  // Segnaposto storici: "...", "sk_test_...", "price_..."
  if (trimmed.endsWith("...")) return false;
  if (/^\.+$/.test(trimmed)) return false;

  const upper = trimmed.toUpperCase();
  return !PLACEHOLDER_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

/** Legge una variabile d'ambiente restituendo `undefined` se è un segnaposto. */
export function readSecret(name: string): string | undefined {
  const value = process.env[name];
  return isConfiguredSecret(value) ? value : undefined;
}

/**
 * Bypass del paywall per collaudare i moduli end-to-end in locale, senza
 * consumare crediti né sbattere contro i limiti di piano.
 *
 * Richiede ENTRAMBE le condizioni — variabile impostata E ambiente non di
 * produzione — e il secondo controllo non è ridondante: è la rete di
 * sicurezza che rende innocuo dimenticare la variabile impostata in un
 * deploy. Senza, un valore rimasto per errore in produzione regalerebbe il
 * prodotto a chiunque, non solo a chi sta testando in locale.
 *
 * Deliberatamente `DEV_BYPASS_PAYWALL`, non `NEXT_PUBLIC_...`: una variabile
 * con quel prefisso finisce nel bundle JavaScript spedito al browser di ogni
 * visitatore, leggibile da chiunque apra gli strumenti di sviluppo — l'esatto
 * opposto di un interruttore privato per collaudi locali.
 */
export function isDevPaywallBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_BYPASS_PAYWALL === "true";
}
