"use client";

import { useCallback, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CreditCard, Link2, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SettingsTabId = "profile" | "team" | "billing" | "integrations" | "privacy";

const TABS: { id: SettingsTabId; label: string; icon: LucideIcon }[] = [
  { id: "profile", label: "Profilo Agenzia", icon: Building2 },
  { id: "team", label: "Team & Agende", icon: Users },
  { id: "billing", label: "Piani & Fatturazione", icon: CreditCard },
  { id: "integrations", label: "Integrazioni & CRM", icon: Link2 },
  { id: "privacy", label: "Privacy & Normativa", icon: ShieldCheck },
];

function isSettingsTabId(value: string | null): value is SettingsTabId {
  return value !== null && TABS.some((tab) => tab.id === value);
}

interface SettingsTabsProps {
  profile: ReactNode;
  team: ReactNode;
  billing: ReactNode;
  integrations: ReactNode;
  privacy: ReactNode;
}

/**
 * Navigazione a schede di /settings.
 *
 * La scheda attiva vive nell'URL (`?tab=`), non in uno stato locale separato
 * da tenere sincronizzato: così un link esterno come "Aggiorna piano"
 * nell'header apre direttamente la scheda giusta, il pulsante Indietro del
 * browser funziona, e la scheda resta la stessa dopo un refresh.
 *
 * Arrivare con `?plan=`, `?interval=` (dal listino prezzi o dal redirect
 * dopo la registrazione) o `?checkout=` (dal ritorno da Stripe) implica la
 * scheda Piani & Fatturazione anche senza `tab=` esplicito — prima della
 * suddivisione in schede quei contenuti erano semplicemente in pagina, senza
 * bisogno di alcun clic.
 *
 * Le cinque schede restano tutte montate (`hidden` sulle inattive, non uno
 * smontaggio condizionale): passare da una all'altra non deve far perdere i
 * filtri di un form già compilato né rifare le chiamate API già completate.
 */
export function SettingsTabs({ profile, team, billing, integrations, privacy }: SettingsTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedTab = searchParams.get("tab");
  const impliesBilling =
    searchParams.has("plan") || searchParams.has("interval") || searchParams.has("checkout");
  const activeTab: SettingsTabId = isSettingsTabId(requestedTab)
    ? requestedTab
    : impliesBilling
      ? "billing"
      : "profile";

  const selectTab = useCallback(
    (tab: SettingsTabId) => {
      const params = new URLSearchParams(searchParams);
      params.set("tab", tab);
      router.replace(`/settings?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const panels: Record<SettingsTabId, ReactNode> = { profile, team, billing, integrations, privacy };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Sezioni impostazioni"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`settings-tab-${id}`}
            aria-selected={activeTab === id}
            aria-controls={`settings-panel-${id}`}
            onClick={() => selectTab(id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-200",
              activeTab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {TABS.map(({ id }) => (
        <div
          key={id}
          role="tabpanel"
          id={`settings-panel-${id}`}
          aria-labelledby={`settings-tab-${id}`}
          hidden={activeTab !== id}
        >
          <div className="mt-6 space-y-6">{panels[id]}</div>
        </div>
      ))}
    </div>
  );
}
