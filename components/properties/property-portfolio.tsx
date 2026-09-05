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
import { Building2, ChevronDown, FileCode2, FolderOpen, History, ImageOff, Loader2, Pencil, Phone, Plus, Sparkles, UserRound } from "lucide-react";
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
import { PropertyStatusBadge } from "@/components/properties/property-status-badge";
import {
  FILTRI_VUOTI,
  PortfolioFilters,
  passaFiltri,
  type FiltriPortafoglio,
} from "@/components/properties/portfolio-filters";
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
  /*
   * Una scheda aperta per volta.
   *
   * Prima erano aperte TUTTE: ogni immobile mostrava sempre l'editor delle
   * foto e l'elenco dei clienti interessati, quindi venti immobili volevano
   * dire venti gallerie e venti elenchi in una pagina sola. Per trovare il
   * terzo si scorreva per schermate intere, e l'unica cosa che serviva
   * davvero — prezzo, metratura, stato — era sepolta in mezzo.
   */
  const [openId, setOpenId] = useState<string | null>(null);
  const [filtri, setFiltri] = useState<FiltriPortafoglio>(FILTRI_VUOTI);

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

  /*
   * Il filtro vive nel browser, non in una query.
   *
   * Il portafoglio e' gia' tutto in memoria — l'elenco arriva in una chiamata
   * sola — e una richiesta al server a ogni tasto premuto renderebbe la
   * ricerca piu' lenta di quanto non sia scorrere. Quando i portafogli
   * cresceranno oltre le poche centinaia di schede, il posto dove spostarla
   * e' `/api/properties`, non questa funzione.
   */
  const visibili = properties.filter((property) => passaFiltri(property, filtri));

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
          <button type="button" onClick={() => setCreando(true)} className="btn-brand">
            <Plus className="h-4 w-4" />
            Aggiungi immobile
          </button>
        </div>
      </div>

      <PortfolioFilters
        filtri={filtri}
        onChange={setFiltri}
        risultati={visibili.length}
        totale={properties.length}
      />

      {visibili.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Nessun immobile corrisponde ai filtri.
        </p>
      ) : (
        <div className="space-y-3">
          {visibili.map((property) => {
            const aperta = openId === property.id;
            const prezzoMq =
              property.squareMeters > 0
                ? Math.round(property.priceEur / property.squareMeters)
                : null;

            return (
              <section
                key={property.id}
                className={cn(
                  "overflow-hidden rounded-xl border bg-card transition-colors duration-200",
                  aperta ? "border-primary/40" : "border-border"
                )}
              >
                {/* --- Riga compatta: quello che serve per riconoscerlo --- */}
                <div className="flex items-stretch gap-3 p-3 sm:p-4">
                  <button
                    type="button"
                    onClick={() => setOpenId(aperta ? null : property.id)}
                    aria-expanded={aperta}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {/* La copertina: e' come l'agente riconosce l'immobile,
                        prima ancora del riferimento. */}
                    {property.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={property.images[0]}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-lg object-cover sm:h-20 sm:w-20"
                      />
                    ) : (
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground sm:h-20 sm:w-20">
                        <ImageOff className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {property.title}
                        </span>
                        <PropertyStatusBadge status={property.status} />
                      </span>

                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        Rif. {property.reference} · {PROPERTY_TYPE_LABELS[property.type]} ·{" "}
                        {property.zona ? `${property.comune} — ${property.zona}` : property.comune}
                      </span>

                      <span className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-base font-bold text-foreground">
                          {formatPrice(property.priceEur)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {property.squareMeters} mq
                          {prezzoMq ? ` · ${prezzoMq.toLocaleString("it-IT")} €/mq` : ""}
                          {property.rooms ? ` · ${property.rooms} locali` : ""}
                        </span>
                      </span>
                    </span>
                  </button>

                  <div className="flex shrink-0 flex-col items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditing(property)}
                      aria-label={`Modifica ${property.title}`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border-strong text-foreground transition-all duration-200 hover:bg-muted sm:h-9 sm:w-9"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenId(aperta ? null : property.id)}
                      aria-label={aperta ? "Chiudi la scheda" : "Apri la scheda"}
                      aria-expanded={aperta}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground sm:h-9 sm:w-9"
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          aperta && "rotate-180"
                        )}
                      />
                    </button>
                  </div>
                </div>

                {/* --- Dettaglio: montato solo all'apertura ---

                    Non nascosto con `hidden`: l'editor delle foto e l'elenco
                    dei clienti sono componenti veri, e tenerne trenta montati
                    a pagina chiusa e' il peso che si voleva togliere. */}
                {aperta && (
                  <div className="space-y-5 border-t border-border bg-muted/20 p-4 sm:p-5">
                    <PropertyStatusSelect
                      propertyId={property.id}
                      status={property.status}
                      onChange={(status) => patchProperty(property.id, { status })}
                    />

                    <MandateBadge
                      listingType={property.listingType}
                      mandateExpiration={property.mandateExpiration}
                      commissionRate={property.commissionRate}
                      keysInOffice={property.keysInOffice}
                      keysLocation={property.keysLocation}
                    />

                    <div className="rounded-lg border border-border bg-card p-3">
                      <PropertyImagesEditor
                        propertyId={property.id}
                        images={property.images}
                        onChange={(images) => patchProperty(property.id, { images })}
                      />
                    </div>

                    <div className="rounded-lg border border-border bg-card p-3">
                      {/* "Clienti interessati" e non "lead compatibili": e' come
                          li chiama un agente, ed e' anche cio' che sono. */}
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
                          Nessun cliente in archivio cerca qualcosa del genere. Gli abbinamenti
                          nascono dalle preferenze registrate in scheda contatto — zona, budget,
                          tipologia.
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
                                <p className="text-sm font-medium text-foreground">
                                  {match.clientName}
                                </p>
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

                    <div className="rounded-lg border border-border bg-card p-3">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenHistoryId((current) =>
                            current === property.id ? null : property.id
                          )
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

                    <div className="rounded-lg border border-border bg-card p-3">
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
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

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
