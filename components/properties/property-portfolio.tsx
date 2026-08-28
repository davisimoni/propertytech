"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ContractType, EnergyClass, PropertyStatus, PropertyType } from "@prisma/client";
import { Building2, ChevronDown, FileCode2, FolderOpen, Loader2, Phone, Sparkles, History } from "lucide-react";
import { DocumentVault } from "@/components/documents/document-vault";
import {
  CONTRACT_LABELS,
  PROPERTY_TYPE_LABELS,
  formatPrice,
} from "@/lib/listings/property-fields";
import { PERFECT_MATCH_THRESHOLD, matchLabel } from "@/lib/matching/smart-match";
import { GenerationHistory } from "@/components/history/generation-history";
import { PortalFeedPanel } from "@/components/properties/portal-feed-panel";
import { PropertyImagesEditor } from "@/components/properties/property-images-editor";
import { PropertyStatusSelect } from "@/components/properties/property-status-select";
import { cn } from "@/lib/utils";

interface MatchView {
  id: string;
  leadId: string;
  clientName: string;
  clientPhone: string;
  score: number;
  reasons: string[];
}

interface PropertyView {
  id: string;
  reference: string;
  title: string;
  contract: ContractType;
  type: PropertyType;
  comune: string;
  zona: string | null;
  priceEur: number;
  squareMeters: number;
  rooms: number | null;
  energyClass: EnergyClass | null;
  status: PropertyStatus;
  images: string[];
  matches: MatchView[];
}

/** Portafoglio immobili con i "Match Perfetti" calcolati sui lead qualificati. */
export function PropertyPortfolio() {
  const [properties, setProperties] = useState<PropertyView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Un solo fascicolo aperto per volta, e montato solo quando lo si apre:
  // altrimenti una pagina con trenta immobili farebbe trenta chiamate al
  // caricamento, per documenti che nessuno ha chiesto di vedere.
  const [openVaultId, setOpenVaultId] = useState<string | null>(null);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);

  /**
   * Aggiorna un solo immobile in elenco.
   *
   * Stato e fotografie si modificano dalla scheda e non ricaricano la lista:
   * un refetch dopo ogni foto caricata farebbe ripartire anche il calcolo dei
   * lead compatibili di trenta immobili, per un cambiamento che riguarda una
   * riga sola.
   */
  function patchProperty(id: string, patch: Partial<PropertyView>) {
    setProperties((current) =>
      current.map((property) => (property.id === id ? { ...property, ...patch } : property))
    );
  }

  useEffect(() => {
    fetch("/api/properties")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { properties: PropertyView[] } | null) => {
        if (data) setProperties(data.properties);
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-sm">
          <Building2 className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-sm font-semibold text-foreground">
          Il tuo portafoglio è ancora vuoto
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Carica il primo incarico o incolla il link di un annuncio già online: l&apos;AI compila la
          scheda, prepara il feed per i portali e cerca fra i tuoi lead qualificati chi potrebbe
          comprarlo.
        </p>
        <Link href="/social" className="btn-brand mx-auto mt-5">
          <Sparkles className="h-4 w-4" />
          Aggiungi il primo immobile
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <PortalFeedPanel />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {properties.length} immobil{properties.length === 1 ? "e" : "i"} in portafoglio
        </p>
        <a href="/api/properties/xml" download className="btn-outline text-xs">
          <FileCode2 className="h-3.5 w-3.5" />
          Scarica feed XML completo
        </a>
      </div>

      {properties.map((property) => (
        <section key={property.id} className="rounded-xl border border-border bg-card p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">{property.title}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Rif. {property.reference} · {PROPERTY_TYPE_LABELS[property.type]} ·{" "}
                {CONTRACT_LABELS[property.contract]}
              </p>
            </div>
            <p className="shrink-0 text-lg font-bold text-foreground">
              {formatPrice(property.priceEur)}
            </p>
          </div>

          <div className="mt-3">
            <PropertyStatusSelect
              propertyId={property.id}
              status={property.status}
              onChange={(status) => patchProperty(property.id, { status })}
            />
          </div>

          <p className="mt-2 text-sm text-muted-foreground">
            {[
              property.zona ? `${property.comune} — ${property.zona}` : property.comune,
              `${property.squareMeters} mq`,
              property.rooms ? `${property.rooms} locali` : null,
              property.energyClass ? `Classe ${property.energyClass}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <div className="mt-4 border-t border-border pt-3">
            <PropertyImagesEditor
              propertyId={property.id}
              images={property.images}
              onChange={(images) => patchProperty(property.id, { images })}
            />
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Lead compatibili
            </h3>

            {property.matches.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Ancora nessuna affinità per questo immobile. I match nascono dalle preferenze
                registrate in scheda lead — zona, budget, tipologia: apri un lead qualificato,
                compila &quot;Preferenze di ricerca&quot; e il confronto parte da solo.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {property.matches.map((match) => (
                  <li
                    key={match.id}
                    className={cn(
                      "rounded-lg border p-3",
                      match.score >= PERFECT_MATCH_THRESHOLD
                        ? "border-status-qualified/40 bg-status-qualified/5"
                        : "border-border"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{match.clientName}</p>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          match.score >= PERFECT_MATCH_THRESHOLD
                            ? "bg-status-qualified/15 text-status-qualified"
                            : "bg-primary/10 text-primary"
                        )}
                      >
                        {matchLabel(match.score)} · {match.score}%
                      </span>
                    </div>

                    {match.reasons.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {match.reasons.join(" · ")}
                      </p>
                    )}

                    <a
                      href={`tel:${match.clientPhone}`}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {match.clientPhone}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <button
              type="button"
              onClick={() =>
                setOpenHistoryId((current) => (current === property.id ? null : property.id))
              }
              aria-expanded={openHistoryId === property.id}
              className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              <History className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Elaborazioni AI su questo immobile
              <ChevronDown
                className={cn(
                  "ml-auto h-4 w-4 shrink-0 transition-transform duration-200",
                  openHistoryId === property.id && "rotate-180"
                )}
                aria-hidden="true"
              />
            </button>

            {/* Montata solo all'apertura: caricare lo storico di ogni immobile
                dell'elenco significherebbe una richiesta per scheda a ogni
                visita della pagina. */}
            {openHistoryId === property.id && (
              <div className="mt-3">
                <GenerationHistory
                  kind="SOCIAL"
                  propertyId={property.id}
                  emptyHint="Gli annunci e le analisi collegati a questo immobile compariranno qui."
                />
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <button
              type="button"
              onClick={() =>
                setOpenVaultId((current) => (current === property.id ? null : property.id))
              }
              aria-expanded={openVaultId === property.id}
              className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Fascicolo documentale
              <ChevronDown
                className={cn(
                  "ml-auto h-4 w-4 shrink-0 transition-transform duration-200",
                  openVaultId === property.id && "rotate-180"
                )}
                aria-hidden="true"
              />
            </button>

            {openVaultId === property.id && (
              <div className="mt-3">
                <DocumentVault
                  scope="property"
                  scopeId={property.id}
                  scopeLabel={`Rif. ${property.reference}`}
                  showTitle={false}
                />
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
