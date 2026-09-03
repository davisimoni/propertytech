"use client";

import { X } from "lucide-react";

/**
 * Istruzioni per configurare il feed sui portali.
 *
 * # Perché non ci sono percorsi di menu esatti
 *
 * Perché non li conosciamo con certezza e cambiano. Scrivere "Impostazioni →
 * Feed → Aggiungi sorgente" per un pannello che quella voce non ce l'ha manda
 * l'agente a cercarla, e quando non la trova conclude che il nostro feed non
 * funziona. Meglio dire cosa cercare e a chi chiedere: su tutti e tre i
 * portali l'importazione XML si abilita dal referente commerciale
 * dell'agenzia, non da un'impostazione che si trova da soli.
 *
 * È la stessa regola dei connettori gestionale non verificati: un'istruzione
 * che sembra precisa e non lo è costa più di un'istruzione che dichiara i
 * propri limiti.
 */
export function FeedSetupDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Come configurare il feed XML"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Come configurare il feed</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          Il procedimento è lo stesso ovunque: si consegna l&apos;indirizzo una volta, e da lì in
          poi il portale rilegge il portafoglio da solo, di norma una o due volte al giorno.
        </p>

        <ol className="mt-4 space-y-2 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">1.</span> Copia l&apos;indirizzo del feed
            con il pulsante qui accanto.
          </li>
          <li>
            <span className="font-medium text-foreground">2.</span> Chiedi al tuo referente
            commerciale del portale di abilitare l&apos;
            <span className="font-medium text-foreground">importazione XML</span> per la tua
            agenzia, e consegnagli l&apos;indirizzo.
          </li>
          <li>
            <span className="font-medium text-foreground">3.</span> Alla prima lettura vedrai
            comparire gli immobili marcati{" "}
            <span className="font-medium text-foreground">In vendita</span>. Le bozze restano
            fuori.
          </li>
        </ol>

        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <Portale
            nome="Immobiliare.it"
            testo="L'importazione da feed si attiva sul contratto dell'agenzia. Il referente la abilita e registra l'indirizzo: non è un'impostazione disponibile dal pannello."
          />
          <Portale
            nome="Idealista"
            testo="Stessa strada: il feed si configura lato portale su richiesta. Chiedi che venga impostata la lettura giornaliera."
          />
          <Portale
            nome="Casa.it"
            testo="Accetta un feed XML per agenzia. Il referente lo collega al tuo account professionale."
          />
          <Portale
            nome="Gestionale o sito dell'agenzia"
            testo="Se il tuo gestionale importa da XML, l'indirizzo si incolla nella sua sezione di importazione. Il tracciato è quello standard degli annunci immobiliari."
          />
        </div>

        <p className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Prima di consegnarlo:</span> fai validare
          il tracciato dal referente del portale. Ogni portale ha le sue regole sui campi
          obbligatori, e scoprirlo al primo caricamento massivo costa più che chiederlo prima.
        </p>

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="btn-outline text-xs">
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}

function Portale({ nome, testo }: { nome: string; testo: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-foreground">{nome}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{testo}</p>
    </div>
  );
}
