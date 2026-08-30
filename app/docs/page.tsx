import { redirect } from "next/navigation";

/**
 * `/docs` e `/help` sono gli indirizzi che un utente prova d'istinto, ma la
 * guida vive su `/guida` — italiano come il resto delle pagine pubbliche
 * (`/termini`, `/privacy`) e come il pubblico a cui parla.
 *
 * Un alias invece di una seconda pagina: due guide divergerebbero alla prima
 * modifica, e la piu' vecchia resterebbe indicizzata.
 */
export default function DocsPage() {
  redirect("/guida");
}
