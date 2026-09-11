import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";

/**
 * Guscio dell'area riservata: altezza fissa alla finestra, con un solo
 * elemento che scorre.
 *
 * # Perché `relative` su guscio e `main` — la causa dello scroll nel vuoto
 *
 * Un elemento `position: absolute` si posiziona rispetto al primo antenato
 * posizionato. Qui non ce n'era nessuno fra `main` e la finestra, quindi il
 * riferimento degli elementi assoluti delle pagine era la finestra stessa —
 * e un elemento così NON viene ritagliato dall'`overflow` di `main`, perché
 * `main` non è il suo blocco contenitore. Gli input file `sr-only` (pannello
 * perizia, caricamento documenti, import CSV) sono assoluti: stando in fondo
 * a una pagina lunga, allungavano il documento fin lì, e la barra del
 * browser scorreva oltre l'ultima scheda dentro il fondo vuoto. Più lunga la
 * pagina, più vuoto: da qui l'effetto "infinito".
 *
 * Misurato in Chrome headless con il CSS compilato: 1320 px di vuoto su
 * desktop e 1372 su mobile senza `relative`, zero con. Con `relative` gli
 * elementi assoluti restano dentro `main`, scorrono con il contenuto e il
 * documento non supera mai l'altezza della finestra.
 *
 * # `100dvh` e `overscroll-contain`
 *
 * Non sono loro a correggere il problema sopra (la misura dà lo stesso vuoto
 * con e senza), ma restano giusti per ragioni proprie: `100vh` sui telefoni è
 * l'altezza con la barra degli indirizzi ritirata, più alta di quella
 * visibile, mentre `100dvh` la segue; `overscroll-contain` ferma l'elastico
 * dei browser mobili al bordo di `main` invece di passarlo alla pagina.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Header />
        {/* Il padding inferiore su mobile evita che la bottom bar fissa
            copra l'ultimo elemento della pagina. */}
        <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24 md:p-6 md:pb-6">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
