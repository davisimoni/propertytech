/**
 * Quante foto può portare un post social.
 *
 * # Perché in un modulo suo
 *
 * Perché lo stesso numero serve in tre punti che devono dire la stessa cosa:
 * il pannello che smette di accettare file, la rotta che li carica e quella
 * che pubblica. Tre copie divergono al primo ritocco, e la forma che la
 * divergenza prende è la peggiore — un'interfaccia che accetta la decima foto
 * sopra una rotta che la rifiuta.
 *
 * Il valore è il limite di Instagram: un carosello si ferma a 10 elementi, e
 * oltre quello l'API risponde con un errore. Non è una scelta nostra.
 *
 * Vive in un file senza `server-only` perché lo legge anche il browser.
 */
export const MAX_SOCIAL_MEDIA = 10;
