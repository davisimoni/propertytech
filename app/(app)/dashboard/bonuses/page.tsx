import { redirect } from "next/navigation";

/**
 * L'area bonus vive su `/bonuses`, come gli altri moduli, che stanno tutti al
 * primo livello (`/leads`, `/documents`, `/social`). Questo indirizzo esiste
 * perche' e' quello annunciato altrove e perche' e' dove qualcuno provera' ad
 * andare: meglio un rimando che una pagina non trovata.
 */
export default function DashboardBonusesRedirect() {
  redirect("/bonuses");
}
