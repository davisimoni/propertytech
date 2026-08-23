"use client";

import { useCallback, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CreditCard, Gift, Link2, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SettingsTabId = "profile" | "team" | "billing" | "referral" | "integrations" | "privacy";

const TABS: { id: SettingsTabId; label: string; icon: LucideIcon }[] = [
  { id: "profile", label: "Profilo Agenzia", icon: Building2 },
  { id: "team", label: "Team & Agende", icon: Users },
  { id: "billing", label: "Piani & Fatturazione", icon: CreditCard },
  { id: "referral", label: "Referral", icon: Gift },
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
  referral: ReactNode;
  integrations: ReactNode;
  privacy: ReactNode;
}

/**
 * Navigazione a schede di /settings.
 *
 * La scheda attiva vive nell'URL (`?tab=`), non in uno stato locale separato
 * da tenere sincronizzato: così un link esterno come "Aggiorna piano"
 * nell'header, o "Vedi le agenzie invitate" nel popup Referral, apre
 * direttamente la scheda giusta, il pulsante Indietro del browser funziona, e
 * la scheda resta la stessa dopo un refresh.
 *
 * Arrivare con `?plan=`, `?interval=` (dal listino prezzi o dal redirect
 * dopo la registrazione) o `?checkout=` (dal ritorno da Stripe) implica la
 * scheda Piani & Fatturazione anche senza `tab=` esplicito — prima della
 * suddivisione in schede quei contenuti erano semplicemente in pagina, senza
 * bisogno di alcun clic. Il Programma Referral non ha un equivalente: chi
 * vuole arrivarci passa sempre da un link esplicito con `?tab=referral`.
 *
 * Le sei schede restano tutte montate (`hidden` sulle inattive, non uno
 * smontaggio condizionale): passare da una all'altra non deve far perdere i
 * filtri di un form già compilato né rifare le chiamate API già completate.
 *
 * Su mobile la barra è più larga dello schermo (sei schede con icona e
 * etichetta): scorre in orizzontale con snap-per-scheda, senza la scrollbar
 * del browser a fare da rumore visivo — lo swipe col dito basta da solo a
 * comunicare che c'è altro oltre il bordo.
 */
export function SettingsTabs({ profile, team, billing, referral, integrations, privacy }: SettingsTabsProps) {
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

  const panels: Record<SettingsTabId, ReactNode> = {
    profile,
    team,
    billing,
    referral,
    integrations,
    privacy,
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Sezioni impostazioni"
        className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:snap-none sm:px-0"
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
              "flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-200",
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
