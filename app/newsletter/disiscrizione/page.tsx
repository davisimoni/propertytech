import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { PublicNavbar } from "@/components/landing/public-navbar";
import { verificaDisiscrizione } from "@/lib/newsletter/unsubscribe-token";

export const metadata: Metadata = {
  title: "Disiscrizione dalla newsletter",
  // Pagina di servizio raggiunta da un link personale: niente indicizzazione.
  robots: { index: false, follow: false },
};

/**
 * Conferma della disiscrizione dalla newsletter.
 *
 * Il link nel piè di pagina porta qui e non disiscrive da solo: serve un
 * clic su "Conferma", perché i filtri antispam aprono i link delle email per
 * controllarli (vedi `app/api/newsletter/unsubscribe/route.ts`).
 */
export default async function DisiscrizionePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; esito?: string }>;
}) {
  const { token, esito } = await searchParams;
  const session = await auth();
  const valido = Boolean(verificaDisiscrizione(token));

  let titolo: string;
  let testo: string;
  let mostraModulo = false;

  if (esito === "ok") {
    titolo = "Disiscrizione completata";
    testo =
      "Non riceverai più la newsletter. Le comunicazioni di servizio sul tuo account (sessione WhatsApp, crediti operativi, pubblicazioni social, abbonamento e sicurezza) continueranno ad arrivare. Puoi riattivare la newsletter dalle impostazioni, nella sezione Privacy e Normativa.";
  } else if (esito === "non-valido" || !valido) {
    titolo = "Link non valido";
    testo =
      "Il link di disiscrizione non è valido o è incompleto. Puoi gestire la newsletter dalle impostazioni dell'account, nella sezione Privacy e Normativa.";
  } else {
    titolo = "Disiscrizione dalla newsletter";
    testo =
      "Confermando non riceverai più la newsletter del martedì e del giovedì. Le comunicazioni di servizio sul tuo account continueranno ad arrivare.";
    mostraModulo = true;
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar isLoggedIn={Boolean(session?.user)} />
      <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="card-surface p-6">
          <h1 className="text-xl font-bold tracking-tight text-foreground">{titolo}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{testo}</p>

          {mostraModulo && token ? (
            <form
              method="POST"
              action={`/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}&origine=pagina`}
              className="mt-6"
            >
              <button type="submit" className="btn-brand w-full sm:w-auto">
                Conferma la disiscrizione
              </button>
            </form>
          ) : (
            <Link
              href="/settings?tab=privacy"
              className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
            >
              Vai alle preferenze email
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
