import Link from "next/link";
import { ArrowRight, Compass, LifeBuoy } from "lucide-react";
import { auth } from "@/auth";
import { PublicNavbar } from "@/components/landing/public-navbar";
import { LandingFooter } from "@/components/landing/site-footer";

/**
 * Pagina 404.
 *
 * # Perché esisteva un problema
 *
 * Perché senza questo file Next serve la sua schermata predefinita: fondo
 * bianco, nessuna navigazione e la frase **"This page could not be found"**.
 * In inglese, su un prodotto venduto ad agenzie immobiliari italiane, e senza
 * un solo modo di tornare da qualche parte: chi ci arriva da un link vecchio o
 * da un indirizzo scritto a mano chiude la scheda, e per lui il sito è rotto.
 *
 * # Perché la navigazione conta più del testo
 *
 * Una 404 non deve scusarsi, deve rimettere in strada. Chi non ha un account
 * ha davanti la prova gratuita, chi ce l'ha la dashboard: è `PublicNavbar` a
 * distinguerli, come su ogni altra pagina pubblica. Le tre uscite qui sotto
 * coprono i motivi per cui qualcuno finisce su un indirizzo inesistente —
 * cercava il prodotto, cercava una spiegazione, cercava aiuto.
 *
 * # Perché riusa i componenti pubblici
 *
 * Perché una 404 scritta a mano invecchia da sola: cambia il menu e resta
 * indietro, cambia il footer e mostra un recapito vecchio. Con `PublicNavbar`
 * e `LandingFooter` segue il resto del sito senza che nessuno se ne ricordi.
 */
export default async function NotFound() {
  // In una 404 la sessione è un di più, non un requisito: se la lettura non
  // riesce si mostra comunque la pagina, da sconosciuto. Fallire qui
  // significherebbe rispondere con un errore a chi ha solo sbagliato indirizzo.
  const session = await auth().catch(() => null);

  const USCITE = [
    {
      href: "/",
      icona: Compass,
      titolo: "Torna alla home",
      testo: "Cosa fa PropertyTech per la tua agenzia, in due minuti.",
    },
    {
      href: "/guida",
      icona: LifeBuoy,
      titolo: "Guida all'uso",
      testo: "Come si collega WhatsApp, si leggono le visure, si pubblicano gli annunci.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar isLoggedIn={Boolean(session?.user)} />

      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="text-sm font-semibold text-primary">Errore 404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Questa pagina non esiste
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          L&apos;indirizzo che hai aperto non corrisponde a nessuna pagina. Può succedere con un
          link vecchio o con un indirizzo copiato a metà: qui sotto trovi da dove ripartire.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {USCITE.map((uscita) => (
            <Link
              key={uscita.href}
              href={uscita.href}
              className="card-surface group flex min-h-11 flex-col p-4 transition-all duration-200 hover:border-primary/40 hover:shadow-md"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <uscita.icona className="h-4 w-4 text-primary" aria-hidden="true" />
                {uscita.titolo}
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {uscita.testo}
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Se pensi che questa pagina dovrebbe esistere,{" "}
          <Link href="/help" className="font-medium text-primary hover:underline">
            scrivici
          </Link>{" "}
          e la sistemiamo.
        </p>
      </main>

      <LandingFooter />
    </div>
  );
}
