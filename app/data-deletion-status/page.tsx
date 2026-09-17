import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { PublicNavbar } from "@/components/landing/public-navbar";
import { BRAND } from "@/lib/brand";
import { statoCancellazione } from "@/lib/social/data-deletion";

export const metadata: Metadata = {
  title: "Stato della richiesta di cancellazione dati",
  // Pagina raggiunta con un codice personale: non va indicizzata.
  robots: { index: false, follow: false },
};

const DATA_ORA = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});

/**
 * Stato di una richiesta di cancellazione dati proveniente da Meta.
 *
 * L'indirizzo è quello restituito alla callback (`?id=CODICE`). Mostra cosa è
 * stato cancellato e quando, senza esporre nulla della persona: il codice non
 * è associato a un nome, e chi non lo possiede non vede niente.
 */
export default async function StatoCancellazionePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const richiesta = id ? await statoCancellazione(id) : null;
  const session = await auth();

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar isLoggedIn={Boolean(session?.user)} />
      <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="card-surface p-6">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Richiesta di cancellazione dati
          </h1>

          {richiesta ? (
            <>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                <strong className="text-foreground">Cancellazione completata.</strong> I dati
                ottenuti da Facebook sono stati eliminati dai nostri sistemi.
              </p>

              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Codice di conferma</dt>
                  <dd className="font-mono font-medium text-foreground">{richiesta.code}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Ricevuta il</dt>
                  <dd className="font-medium text-foreground">
                    {DATA_ORA.format(richiesta.createdAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Collegamenti eliminati</dt>
                  <dd className="font-medium text-foreground">{richiesta.eliminati}</dd>
                </div>
              </dl>

              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {richiesta.eliminati > 0
                  ? "Erano il collegamento alla Pagina Facebook, l'eventuale profilo Instagram associato e il token di pubblicazione. Da adesso PropertyTech non può più pubblicare su quei canali."
                  : "Non risultava nessun collegamento attivo con questo account Facebook: non c'era nulla da eliminare."}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Nessuna richiesta corrisponde a questo codice. Controlla di aver aperto per intero il
              link ricevuto da Facebook.
            </p>
          )}

          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            Per cancellare anche l&apos;account PropertyTech e i dati che non provengono da
            Facebook, segui le{" "}
            <Link href="/data-deletion" className="font-medium text-primary hover:underline">
              istruzioni per la cancellazione
            </Link>{" "}
            o scrivi a{" "}
            <a href={`mailto:${BRAND.email}`} className="font-medium text-primary hover:underline">
              {BRAND.email}
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
