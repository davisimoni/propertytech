"use client";

import { useState } from "react";
import { Check, Clipboard, MessageCircle } from "lucide-react";
import { truncateForShare, whatsappShareUrl } from "@/lib/share";
import { cn } from "@/lib/utils";

interface ShareActionsProps {
  /** Testo da copiare e da precompilare nel messaggio WhatsApp. */
  text: string;
  /**
   * Destinatario del deep link, quando è noto.
   *
   * Senza, `wa.me` apre WhatsApp e fa scegliere il contatto a mano — che va
   * bene per un inoltro estemporaneo, ma non quando il numero è già scritto
   * nella scheda: lì far ricercare il destinatario è un passaggio in più e
   * un'occasione per sbagliare persona.
   */
  phone?: string | null;
  copyLabel?: string;
  className?: string;
}

/** Coppia di azioni rapide: copia negli appunti e inoltro via WhatsApp. */
export function ShareActions({
  text,
  phone,
  copyLabel = "Copia Testo",
  className,
}: ShareActionsProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function copy() {
    /*
     * Gli appunti possono rifiutare: richiedono un contesto sicuro e un
     * permesso che il browser può negare. Senza questo `catch` la promessa
     * finiva non gestita e il pulsante restava semplicemente inerte — l'agente
     * premeva, non vedeva "Copiato!", e non aveva modo di capire perché.
     */
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 4000);
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-status-qualified" />
        ) : (
          <Clipboard className="h-3.5 w-3.5" />
        )}
        {copied ? "Copiato negli appunti!" : copyLabel}
      </button>

      <a
        href={whatsappShareUrl(truncateForShare(text), phone)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-status-qualified/40 px-2.5 py-1.5 text-xs font-medium text-status-qualified transition-all duration-200 hover:bg-status-qualified/10"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        Invia via WhatsApp
      </a>

      {copyError && (
        <p role="alert" className="w-full text-xs text-status-blocked">
          Il browser non ha concesso l&apos;accesso agli appunti: seleziona il testo e copialo a
          mano.
        </p>
      )}
    </div>
  );
}
