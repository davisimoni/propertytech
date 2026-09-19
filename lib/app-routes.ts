/**
 * I prefissi dell'area riservata, in un modulo senza dipendenze.
 *
 * # Perché un file a parte
 *
 * Perché lo leggono il middleware, che gira sull'edge e non deve trascinarsi
 * dietro componenti React, e il menu dell'app, che lo usa per controllarsi.
 * Finché l'elenco viveva solo nel middleware, due voci di menu (`/radar` e
 * `/bonuses`) erano rimaste fuori: la pagina si apriva a chiunque, con la
 * cornice dell'app e i dati vuoti. Nessun dato di un'agenzia usciva, perché
 * le API controllano l'accesso per conto loro, ma un'area riservata che si
 * apre senza accesso resta un errore.
 *
 * `/invito` non è qui di proposito: chi accetta un invito non ha ancora un
 * account, e proteggerla lo rimanderebbe a un accesso che non può effettuare.
 */
export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/leads",
  "/documents",
  "/social",
  "/properties",
  "/radar",
  "/voice-reports",
  "/bonuses",
  "/settings",
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
