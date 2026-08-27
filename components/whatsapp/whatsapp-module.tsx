"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { FlaskConical, ListChecks } from "lucide-react";
import { ConnectionPanel } from "./connection-panel";
import { LeadPipeline } from "./lead-pipeline";
import { ChatSimulator } from "./chat-simulator";
import { QrAcquisitionCard } from "./qr-acquisition-card";
import { cn } from "@/lib/utils";
import { LeadImport } from "@/components/whatsapp/lead-import";

type TabId = "pipeline" | "simulator";

const TABS = [
  { id: "pipeline" as const, label: "Pipeline Lead", icon: ListChecks },
  { id: "simulator" as const, label: "Testa l'AI", icon: FlaskConical },
];

/**
 * Unisce le sezioni del Modulo 1. Il cambio di stato connessione forza il
 * rimontaggio della pipeline, così i lead rimasti PENDING per assenza di
 * configurazione vengono rivalutati subito dopo la connessione.
 */
export function WhatsAppModule() {
  const { data: session } = useSession();
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<TabId>("pipeline");
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="space-y-6">
      <ConnectionPanel onConnectionChange={() => setReloadKey((key) => key + 1)} />

      {/* Rimontata al cambio di connessione, così rilegge il numero appena
          collegato senza che l'agente debba ricaricare la pagina. */}
      <QrAcquisitionCard key={`qr-${reloadKey}`} />

      {/* Stessa chiave di rimontaggio del resto: a importazione finita la
          pipeline si rilegge da sola, senza ricaricare la pagina. */}
      <LeadImport
        isOpen={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => setReloadKey((key) => key + 1)}
      />

      <div role="tablist" aria-label="Sezioni WhatsApp" className="flex flex-wrap gap-2">
        {TABS.map((item) => {
          const Icon = item.icon;
          const isActive = tab === item.id;
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => setTab(item.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-brand-gradient text-white shadow-sm"
                  : // Stesso trattamento dei tab in module-with-history: da
                    // inattivi non devono sembrare disabilitati.
                    "border border-border-strong text-foreground hover:border-primary hover:bg-muted"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "pipeline" ? (
        <LeadPipeline
          key={reloadKey}
          onImportRequested={() => setImportOpen(true)}
          onTryAssistant={() => setTab("simulator")}
        />
      ) : (
        <ChatSimulator agencyName={session?.user?.agencyName ?? "la tua agenzia"} />
      )}
    </div>
  );
}
