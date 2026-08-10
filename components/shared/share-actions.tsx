"use client";

import { useState } from "react";
import { Check, Clipboard, MessageCircle } from "lucide-react";
import { truncateForShare, whatsappShareUrl } from "@/lib/share";
import { cn } from "@/lib/utils";

interface ShareActionsProps {
  /** Testo da copiare e da precompilare nel messaggio WhatsApp. */
  text: string;
  copyLabel?: string;
  className?: string;
}

/** Coppia di azioni rapide: copia negli appunti e inoltro via WhatsApp. */
export function ShareActions({ text, copyLabel = "Copia Testo", className }: ShareActionsProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        {copied ? "Copiato!" : copyLabel}
      </button>

      <a
        href={whatsappShareUrl(truncateForShare(text))}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-status-qualified/40 px-2.5 py-1.5 text-xs font-medium text-status-qualified transition-all duration-200 hover:bg-status-qualified/10"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        Invia via WhatsApp
      </a>
    </div>
  );
}
