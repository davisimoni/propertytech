import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { PublicNavbar } from "@/components/landing/public-navbar";
import { verificaDisiscrizione } from "@/lib/newsletter/unsubscribe-token";
import { AutoDisiscrizione } from "./auto-disiscrizione";

export const metadata: Metadata = {
  title: "Disiscrizione dalla newsletter",
  // Pagina di servizio raggiunta da un link personale: niente indicizzazione.
  robots: { index: false, follow: false },
};

/**
 * Pagina di disiscrizione dalla newsletter.
 *
 * Con un token valido la disiscrizione parte da sola nel browser
 * (`AutoDisiscrizione`): un clic sul link dell'email basta. Il perché non
 * avvenga già sul GET del link è in `app/api/unsubscribe/route.ts`. Senza
 * JavaScript resta il modulo di conferma.
 */
export default async function DisiscrizionePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; esito?: string }>;
}) {
  const { token, esito } = await searchParams;
  const session = await auth();
  const valido = Boolean(verificaDisiscrizione(token));

  let contenuto: React.ReactNode;

  if (esito === "ok" && valido && token) {
    contenuto = (
      <>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Disiscrizione completata.</strong> Non riceverai più
          la newsletter. Le comunicazioni di servizio sul tuo account continueranno ad arrivare.
        </p>
        <form
          method="POST"
          action={`/api/unsubscribe?token=${encodeURIComponent(token)}&azione=riattiva&origine=pagina`}
          className="mt-5"
        >
          <button type="submit" className="text-sm font-medium text-primary hover:underline">
            Mi sono disiscritto per errore: riattiva la newsletter
          </button>
        </form>
      </>
    );
  } else if (esito === "riattivata" && valido) {
    contenuto = (
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        La newsletter è di nuovo attiva: riceverai il prossimo numero del martedì o del giovedì.
      </p>
    );
  } else if (!valido || !token) {
    contenuto = (
      <>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Il link di disiscrizione non è valido o è incompleto. Puoi gestire la newsletter dalle
          impostazioni dell&apos;account, nella sezione Privacy e Normativa.
        </p>
        <Link
          href="/settings?tab=privacy"
          className="mt-5 inline-block text-sm font-medium text-primary hover:underline"
        >
          Vai alle preferenze notifiche
        </Link>
      </>
    );
  } else {
    contenuto = (
      <>
        <AutoDisiscrizione token={token} />
        <noscript>
          <form
            method="POST"
            action={`/api/unsubscribe?token=${encodeURIComponent(token)}&origine=pagina`}
            className="mt-5"
          >
            <button type="submit" className="btn-brand w-full sm:w-auto">
              Conferma la disiscrizione
            </button>
          </form>
        </noscript>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar isLoggedIn={Boolean(session?.user)} />
      <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="card-surface p-6">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {esito === "riattivata" ? "Newsletter riattivata" : "Disiscrizione dalla newsletter"}
          </h1>
          {contenuto}
        </div>
      </main>
    </div>
  );
}
