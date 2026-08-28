"use client";

import { useState } from "react";
import { Bot, Loader2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Presa in carico umana di una conversazione.
 *
 * Il testo dice cosa succede adesso, non come si chiama l'impostazione: davanti
 * a un cliente che sta scrivendo, l'agente deve capire in un colpo d'occhio se
 * l'assistente gli risponderà sopra.
 */
export function AiHandoverToggle({
  leadId,
  aiEnabled,
  onChange,
}: {
  leadId: string;
  aiEnabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    const next = !aiEnabled;
    // Ottimistico: il gesto si fa mentre il cliente scrive, e un'attesa di rete
    // su un interruttore si nota. In caso di errore si torna indietro.
    onChange(next);
    setIsSaving(true);
    setError(false);
    try {
      const response = await fetch(`/api/whatsapp/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiEnabled: next }),
      });
      if (!response.ok) throw new Error();
    } catch {
      onChange(!next);
      setError(true);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        aiEnabled ? "border-border bg-muted/40" : "border-status-pending/40 bg-status-pending/10"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {aiEnabled ? (
            <Bot className="h-4 w-4 shrink-0 text-status-qualified" />
          ) : (
            <UserRound className="h-4 w-4 shrink-0 text-status-pending" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {aiEnabled ? "Assistente AI attivo" : "Conversazione gestita da te"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {aiEnabled
                ? "Risponde da solo ai messaggi di questo contatto."
                : "L'assistente non risponde più: i messaggi arrivano e restano in attesa."}
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={aiEnabled}
          aria-label="Assistente AI su questa conversazione"
          onClick={toggle}
          disabled={isSaving}
          className={cn(
            "relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-all duration-200 disabled:opacity-50 sm:h-9 sm:w-9",
            aiEnabled
              ? "border-border-strong hover:bg-muted"
              : "border-status-pending/50 hover:bg-status-pending/20"
          )}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : aiEnabled ? (
            <UserRound className="h-4 w-4" />
          ) : (
            <Bot className="h-4 w-4" />
          )}
        </button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {aiEnabled
          ? "Puoi mettere in pausa anche scrivendo !pausa direttamente nella chat WhatsApp."
          : "Scrivi !riprendi nella chat WhatsApp per riattivarlo, oppure premi il pulsante."}
      </p>

      {error ? (
        <p className="mt-2 text-xs text-status-blocked">Modifica non salvata. Riprova.</p>
      ) : null}
    </div>
  );
}
