import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";

/**
 * Guscio dell'area riservata: altezza fissa alla finestra, con un solo
 * elemento che scorre.
 *
 * # Perché `100dvh` e non `h-screen`
 *
 * `h-screen` vale `100vh`, che sui browser da telefono è l'altezza dello
 * schermo **con la barra degli indirizzi già ritirata** — non quella che si
 * vede in quel momento. Con `viewport-fit=cover` (vedi `app/layout.tsx`) il
 * guscio risultava così più alto della finestra visibile, il documento
 * diventava scorrevole di quella differenza, e arrivati in fondo al contenuto
 * si continuava a scorrere dentro il fondo pagina vuoto. `100dvh` è
 * l'altezza *dinamica*: segue la barra mentre compare e scompare, quindi il
 * guscio combacia sempre con ciò che si vede. È la stessa unità già usata dai
 * pannelli laterali di questo progetto.
 *
 * # Perché `overscroll-contain` sul contenuto
 *
 * Perché senza, esaurito lo scorrimento di `main`, il gesto prosegue sul
 * documento sottostante (scroll chaining) e sull'elastico dei browser
 * mobili: è l'altra metà dello "spazio vuoto infinito". `contain` ferma il
 * gesto al confine di questo riquadro senza disabilitare nulla dentro.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Header />
        {/* Il padding inferiore su mobile evita che la bottom bar fissa
            copra l'ultimo elemento della pagina. */}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24 md:p-6 md:pb-6">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
