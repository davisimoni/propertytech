"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  UserRole,
  ContractType,
  EnergyClass,
  ListingType,
  PropertyStatus,
  PropertyType,
} from "@prisma/client";
import { Building2, ChevronDown, FileCode2, FolderOpen, History, Loader2, Pencil, Phone, Plus, Sparkles, UserRound } from "lucide-react";
import { DocumentVault } from "@/components/documents/document-vault";
import {
  CONTRACT_LABELS,
  PUBLISHED_STATUSES,
  PROPERTY_TYPE_LABELS,
  formatPrice,
} from "@/lib/listings/property-fields";
import { PERFECT_MATCH_THRESHOLD, matchLabel } from "@/lib/matching/smart-match";
import { GenerationHistory } from "@/components/history/generation-history";
import { PortalFeedPanel } from "@/components/properties/portal-feed-panel";
import { PropertyEditDialog } from "@/components/properties/property-edit-dialog";
import { PropertyImagesEditor } from "@/components/properties/property-images-editor";
import { PropertyStatusSelect } from "@/components/properties/property-status-select";
import { MandateBadge } from "@/components/properties/mandate-badge";
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
  listingType: ListingType | null;
  mandateExpiration: string | null;
  commissionRate: number | null;
  keysInOffice: boolean;
  keysLocation: string | null;
  // Campi che la finestra di modifica scrive: erano gia' restituiti dall'API,
  // mancavano solo qui.
  provincia: string | null;
  indirizzo: string | null;
  bathrooms: number | null;
  floor: string | null;
  description: string | null;
  matches: MatchView[];
}

/** Portafoglio immobili con i "Match Perfetti" calcolati sui lead qualificati. */
export function PropertyPortfolio({ currentRole }: { currentRole: UserRole }) {
  const [properties, setProperties] = useState<PropertyView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Un solo fascicolo aperto per volta, e montato solo quando lo si apre:
  // altrimenti una pagina con trenta immobili farebbe trenta chiamate al
  // caricamento, per documenti che nessuno ha chiesto di vedere.
  const [openVaultId, setOpenVaultId] = useState<string | null>(null);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PropertyView | null>(null);
  const [creando, setCreando] = useState(false);

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

  /**
   * Ricarica il portafoglio dal server.
   *
   * Estratta dall'effetto perche' serve anche dopo aver aggiunto un immobile:
   * la creazione risponde con l'id e l'esito del matching, non con la scheda
   * completa, e ricostruirla nel browser significherebbe tenerne due versioni
   * che al primo campo aggiunto non coincidono piu'.
   */
  const caricaPortafoglio = useCallback(() => {
    return fetch("/api/properties")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((data: { properties: PropertyView[] }) => {
        setProperties(data.properties);
        setLoadError(false);
      })
      // Errore dichiarato, non stato vuoto: mostrare "aggiungi il primo
      // immobile" a un'agenzia che ne ha cinquanta, perche' una richiesta e'
      // fallita, la convince di aver perso il portafoglio.
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    void caricaPortafoglio();
  }, [caricaPortafoglio]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-xl border border-status-blocked/30 bg-status-blocked/10 p-6 text-center">
        <p className="text-sm font-medium text-foreground">
          Non è stato possibile caricare il portafoglio.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          I tuoi immobili non sono stati toccati. Ricarica la pagina per riprovare.
        </p>
        <button type="button" onClick={() => window.location.reload()} className="btn-outline mx-auto mt-4 text-xs">
          Ricarica
        </button>
      </section>
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
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link href="/social" className="btn-brand">
            <Sparkles className="h-4 w-4" />
            Parti da un annuncio
          </Link>
          {/* Chi ha gia' i dati sottomano non deve passare da una generazione
              che non gli serve per mettere un immobile in archivio. */}
          <button type="button" onClick={() => setCreando(true)} className="btn-outline">
            <Plus className="h-4 w-4" />
            Inserisci a mano
          </button>
        </div>

        {creando && (
          <PropertyEditDialog
            property={null}
            onClose={() => setCreando(false)}
            onSaved={() => {}}
            onCreated={() => void caricaPortafoglio()}
          />
        )}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <PortalFeedPanel
        currentRole={currentRole}
        missingPhotos={
          properties.filter(
            (property) =>
              (PUBLISHED_STATUSES as readonly PropertyStatus[]).includes(property.status) &&
              property.images.length === 0
          ).length
        }
        publishedCount={
          properties.filter((property) =>
            (PUBLISHED_STATUSES as readonly PropertyStatus[]).includes(property.status)
          ).length
        }
        draftCount={properties.filter((property) => property.status === "DRAFT").length}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {properties.length} immobil{properties.length === 1 ? "e" : "i"} in portafoglio
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/properties/xml" download className="btn-outline text-xs">
            <FileCode2 className="h-3.5 w-3.5" />
            Scarica feed XML completo
          </a>
          {/* Azione primaria a destra, accanto all'export.

              Sta qui e non solo nello stato vuoto perche' un immobile si
              aggiunge anche quando il portafoglio e' pieno — anzi, soprattutto
              allora — e finora l'unica strada era passare da Social & Annunci
              e generare un annuncio che magari non serviva. */}
          <button type="button" onClick={() => setCreando(true)} className="btn-brand text-xs">
            <Plus className="h-3.5 w-3.5" />
            Aggiungi immobile
          </button>
        </div>
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
            <div className="flex shrink-0 items-center gap-2">
              <p className="text-lg font-bold text-foreground">{formatPrice(property.priceEur)}</p>
              <button
                type="button"
                onClick={() => setEditing(property)}
                aria-label={`Modifica ${property.title}`}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border-strong text-foreground transition-all duration-200 hover:bg-muted sm:h-9 sm:w-9"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          </div>

          <MandateBadge
            listingType={property.listingType}
            mandateExpiration={property.mandateExpiration}
            commissionRate={property.commissionRate}
            keysInOffice={property.keysInOffice}
            keysLocation={property.keysLocation}
          />

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
            {/* "Clienti interessati" e non "lead compatibili": e' come li
                chiama un agente, ed e' anche cio' che sono — persone che
                cercano esattamente questo, non righe di un abbinamento. */}
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <UserRound className="h-3.5 w-3.5" />
              Clienti interessati
              {property.matches.length > 0 ? (
                <span className="ml-1 rounded-full bg-status-qualified/10 px-1.5 py-0.5 text-[10px] font-semibold text-status-qualified">
                  {property.matches.length}
                </span>
              ) : null}
            </h3>

            {property.matches.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nessun cliente in archivio cerca qualcosa del genere. Gli abbinamenti nascono
                dalle preferenze registrate in scheda contatto — zona, budget, tipologia: apri un
                lead qualificato,
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

      {editing ? (
        <PropertyEditDialog
          property={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) =>
            // Solo i campi modificati: `matches` e `images` restano quelli in
            // memoria, che la finestra non tocca e che il server non rispedisce.
            setProperties((current) =>
              current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
            )
          }
        />
      ) : null}

      {creando && (
        <PropertyEditDialog
          property={null}
          onClose={() => setCreando(false)}
          // In creazione non c'è una riga da aggiornare in elenco: si ricarica.
          onSaved={() => {}}
          onCreated={() => void caricaPortafoglio()}
          riferimentiEsistenti={properties.map((property) => property.reference)}
        />
      )}
    </div>
  );
}
