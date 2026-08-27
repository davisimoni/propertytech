"use client";

import { useState, type ReactNode } from "react";
import { History, Sparkles } from "lucide-react";
import { GenerationHistory } from "@/components/history/generation-history";
import type { HistoryKind } from "@/lib/history/entries";
import { cn } from "@/lib/utils";

/**
 * Modulo con due viste: lo strumento e la sua cronologia.
 *
 * Lo strumento resta montato quando si passa alla cronologia — viene solo
 * nascosto — perché un agente che sta compilando un annuncio e sbircia lo
 * storico non deve ritrovare il modulo svuotato al ritorno.
 *
 * La cronologia invece si smonta: rimontandola rilegge, ed è ciò che serve
 * dopo aver appena generato qualcosa.
 */
export function ModuleWithHistory({
  kind,
  workLabel = "Genera",
  emptyHint,
  children,
}: {
  kind: HistoryKind;
  workLabel?: string;
  emptyHint?: string;
  children: ReactNode;
}) {
  const [tab, setTab] = useState<"work" | "history">("work");

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Viste del modulo" className="flex flex-wrap gap-2">
        <Tab
          isActive={tab === "work"}
          onClick={() => setTab("work")}
          icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
          label={workLabel}
        />
        <Tab
          isActive={tab === "history"}
          onClick={() => setTab("history")}
          icon={<History className="h-4 w-4" aria-hidden="true" />}
          label="Cronologia"
        />
      </div>

      {/* `hidden` anziché smontaggio: conserva quello che l'agente ha scritto. */}
      <div className={tab === "work" ? undefined : "hidden"}>{children}</div>

      {tab === "history" && <GenerationHistory kind={kind} emptyHint={emptyHint} />}
    </div>
  );
}

function Tab({
  isActive,
  onClick,
  icon,
  label,
}: {
  isActive: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      role="tab"
      type="button"
      aria-selected={isActive}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
        isActive
          ? "bg-brand-gradient text-white shadow-sm"
          : // Bordo marcato e testo pieno: da inattivo era doppiamente
            // sbiadito — contorno appena percettibile e testo attenuato — e
            // sembrava disabilitato invece che solo non selezionato.
            "border border-border-strong text-foreground hover:border-primary hover:bg-muted"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
