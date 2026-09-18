"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";

/**
 * Il punto interrogativo accanto a un comando, con la spiegazione.
 *
 * # Perché non basta l'attributo `title`
 *
 * Perché `title` si apre al passaggio del mouse, e su un telefono il mouse non
 * c'è: al tocco non succede niente. Finché queste spiegazioni erano un di più
 * accanto a un testo già completo la cosa passava; da quando la spiegazione
 * lunga sta *dentro* il tooltip, uno che sul telefono non si apre significa
 * che l'informazione su mobile non esiste. Ed è il caso d'uso principale, un
 * agente in sopralluogo (CLAUDE.md §1).
 *
 * # Perché `fixed` e non un riquadro dentro il flusso
 *
 * Perché il testo si apre dentro schede, drawer e modali che scorrono e che
 * ritagliano quello che esce dai loro bordi. Un riquadro posizionato rispetto
 * alla finestra non viene ritagliato da nessuno di quei contenitori, e le
 * coordinate si calcolano dal pulsante al momento dell'apertura, quindi sono
 * giuste anche a metà scorrimento. Si chiude allo scorrimento successivo, che
 * è anche il gesto con cui le persone se ne liberano.
 *
 * # Perché è un `button` e non uno `span`
 *
 * Perché deve poter ricevere il fuoco da tastiera e annunciare il proprio
 * stato: uno `span` con `title` è invisibile a chi non usa il mouse, e questa
 * è l'unica spiegazione presente accanto a comandi che costano un credito.
 */
export function InfoTip({ label }: { label: string }) {
  const [posizione, setPosizione] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const bottone = useRef<HTMLButtonElement>(null);

  const aperto = posizione !== null;

  useEffect(() => {
    if (!aperto) return;

    function chiudi() {
      setPosizione(null);
    }
    function suTasto(evento: KeyboardEvent) {
      if (evento.key === "Escape") chiudi();
    }
    function suClic(evento: MouseEvent) {
      if (!bottone.current?.contains(evento.target as Node)) chiudi();
    }

    window.addEventListener("keydown", suTasto);
    // `capture` sullo scorrimento: quello vero avviene dentro il contenitore
    // della pagina, non sulla finestra, e in fase di bolla non arriverebbe.
    window.addEventListener("scroll", chiudi, true);
    window.addEventListener("resize", chiudi);
    document.addEventListener("click", suClic);

    return () => {
      window.removeEventListener("keydown", suTasto);
      window.removeEventListener("scroll", chiudi, true);
      window.removeEventListener("resize", chiudi);
      document.removeEventListener("click", suClic);
    };
  }, [aperto]);

  function apriOChiudi() {
    if (aperto) {
      setPosizione(null);
      return;
    }

    const riquadro = bottone.current?.getBoundingClientRect();
    if (!riquadro) return;

    // Largo quanto serve, mai oltre lo schermo meno un margine: su 390px un
    // riquadro da 280 resta dentro, e su desktop non diventa una striscia.
    const larghezza = Math.min(280, window.innerWidth - 24);
    const centrato = riquadro.left + riquadro.width / 2 - larghezza / 2;
    const sinistra = Math.min(Math.max(12, centrato), window.innerWidth - larghezza - 12);

    setPosizione({ top: riquadro.bottom + 8, left: sinistra, width: larghezza });
  }

  return (
    <>
      <button
        ref={bottone}
        type="button"
        onClick={apriOChiudi}
        aria-label={label}
        aria-expanded={aperto}
        // `title` resta per chi usa il mouse: al passaggio la spiegazione
        // compare senza dover premere, come prima.
        title={label}
        // L'area toccabile è più grande del disegno: `after` la porta a 40px
        // senza allargare l'icona né spostare il testo che le sta accanto.
        className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors after:absolute after:-inset-2.5 after:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {posizione && (
        /* Uno `span`, non un `div`: questi tooltip stanno spesso dentro un
           paragrafo, e un elemento di blocco dentro un `<p>` il browser lo
           sposta fuori, mandando in errore l'idratazione di React. */
        <span
          role="tooltip"
          className="fixed z-[200] block rounded-lg border border-border bg-card p-2.5 text-xs leading-relaxed text-foreground shadow-lg"
          style={{ top: posizione.top, left: posizione.left, width: posizione.width }}
        >
          {label}
        </span>
      )}
    </>
  );
}
