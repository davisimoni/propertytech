import { HelpCircle } from "lucide-react";

/**
 * Il punto interrogativo accanto a un comando, con la spiegazione.
 *
 * # Perché `title` e non un riquadro disegnato
 *
 * Perché un tooltip costruito a mano va posizionato, e su un pannello che
 * scorre dentro un drawer finisce tagliato dal bordo o sotto un altro
 * elemento — il tipo di difetto che si vede solo su uno schermo stretto,
 * cioè proprio quello dell'agente in sopralluogo. `title` lo posiziona il
 * browser, non sbaglia mai, e su touch resta comunque leggibile perché il
 * testo è anche l'etichetta accessibile del pulsante.
 *
 * # Perché è un `button` e non uno `span`
 *
 * Perché deve poter ricevere il fuoco da tastiera: uno `span` con `title` è
 * invisibile a chi non usa il mouse, e questa è l'unica spiegazione presente
 * accanto a comandi che costano un credito.
 */
export function InfoTip({ label }: { label: string }) {
  return (
    <button
      type="button"
      // `tabIndex` esplicito e nessuna azione al clic: serve solo a portare il
      // fuoco, perché è il fuoco a rivelare il testo a chi naviga da tastiera.
      aria-label={label}
      title={label}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
