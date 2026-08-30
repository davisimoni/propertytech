import { redirect } from "next/navigation";

/**
 * Alias di `/termini`.
 *
 * L'indirizzo italiano resta il canonico — e' quello nel footer e quello
 * indicizzato — ma chi arriva da un link in inglese non deve trovare un 404.
 */
export default function TermsPage() {
  redirect("/termini");
}
