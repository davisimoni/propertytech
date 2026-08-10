import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Sei offline",
  // Non deve finire nei risultati di ricerca: è una pagina di servizio.
  robots: { index: false, follow: false },
};

/**
 * Pagina mostrata dal service worker quando manca la connessione.
 *
 * Volutamente priva di dati: è l'unica pagina che può essere servita dalla
 * cache, e su un telefono condiviso non deve mostrare nulla di nessuno.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <WifiOff className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-foreground">Sei offline</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Non riusciamo a raggiungere PropertyTech. Controlla la connessione: i tuoi lead sono al
          sicuro e li ritrovi appena torni online.
        </p>
        <Link href="/dashboard" className="btn-brand mt-5">
          Riprova
        </Link>
      </div>
    </div>
  );
}
