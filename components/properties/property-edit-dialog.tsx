"use client";

import { useEffect, useState } from "react";
import type { ContractType, EnergyClass, ListingType, PropertyType } from "@prisma/client";
import { LISTING_TYPE_HINTS, LISTING_TYPE_LABELS } from "@/lib/listings/mandate";
import { FileSignature, KeyRound, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/shared/toast-provider";
import {
  CONTRACT_LABELS,
  ENERGY_CLASSES,
  PROPERTY_TYPE_LABELS,
} from "@/lib/listings/property-fields";

/** Campi modificabili della scheda. Le foto si gestiscono dalla loro sezione. */
export interface EditableProperty {
  id: string;
  reference: string;
  title: string;
  contract: ContractType;
  type: PropertyType;
  comune: string;
  provincia: string | null;
  zona: string | null;
  indirizzo: string | null;
  priceEur: number;
  squareMeters: number;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  energyClass: EnergyClass | null;
  description: string | null;
  listingType: ListingType | null;
  /** ISO completo dal server; il campo data del browser ne usa i primi 10 caratteri. */
  mandateExpiration: string | null;
  commissionRate: number | null;
  keysInOffice: boolean;
  keysLocation: string | null;
}

/** Numero dal campo, o `undefined` se lasciato vuoto. */
function toNumber(value: string): number | undefined {
  const clean = value.trim();
  if (!clean) return undefined;
  const parsed = Number.parseInt(clean, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Numero con decimali, per la provvigione.
 *
 * Separato da `toNumber`, che fa `parseInt`: una provvigione del 3,5%
 * diventerebbe 3. Si accetta anche la virgola, che e' come la scrive un
 * agente italiano.
 */
function toDecimal(value: string): number | null {
  const clean = value.trim().replace(",", ".");
  if (!clean) return null;
  const parsed = Number.parseFloat(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Testo, o `undefined` se vuoto: i campi facoltativi tornano a `null` sul server. */
function toText(value: string): string | undefined {
  return value.trim() || undefined;
}

const MESSAGGI: Record<string, string> = {
  reference_taken: "Esiste già un immobile con questo riferimento.",
  not_found: "Immobile non trovato.",
  unauthorized: "Sessione scaduta. Ricarica la pagina.",
};

/**
 * Scheda immobile: la stessa per crearne uno e per modificarlo.
 *
 * # Perché un componente solo
 *
 * Perché i campi sono gli stessi, e due moduli separati divergono al primo
 * campo aggiunto a uno dei due — di solito quello della creazione, che si
 * tocca meno. Cambia solo dove va a finire il salvataggio: `POST` su
 * `/api/properties` per un immobile nuovo, `PUT` sulla sua rotta per uno che
 * esiste già.
 *
 * `property` a `null` significa "nuovo": il modulo parte vuoto, col contratto
 * e la tipologia sui valori più comuni, che sono quelli che l'agente conferma
 * nella maggior parte dei casi.
 */
export function PropertyEditDialog({
  property,
  onClose,
  onSaved,
  onCreated,
  riferimentiEsistenti = [],
}: {
  /** `null` per creare un immobile nuovo. */
  property: EditableProperty | null;
  onClose: () => void;
  onSaved: (updated: EditableProperty) => void;
  /** Chiamata dopo una creazione riuscita: il portafoglio si ricarica. */
  onCreated?: () => void;
  /**
   * Riferimenti già in portafoglio, per fermare un doppione in creazione.
   *
   * Serve perché la rotta di salvataggio fa `upsert` sul riferimento: è voluto
   * per il flusso da Social & Annunci, dove risalvare lo stesso immobile dopo
   * una correzione deve aggiornarlo invece di rifiutarlo. Ma partendo da
   * "Aggiungi immobile" la stessa regola è pericolosa: chi digita "A102" senza
   * sapere che esiste già ne sovrascriverebbe un altro senza un avviso, e se ne
   * accorgerebbe quando l'immobile giusto non si trova più.
   */
  riferimentiEsistenti?: string[];
}) {
  const inCreazione = property === null;

  const [form, setForm] = useState({
    reference: property?.reference ?? "",
    title: property?.title ?? "",
    contract: property?.contract ?? ("VENDITA" as ContractType),
    type: property?.type ?? ("APPARTAMENTO" as PropertyType),
    comune: property?.comune ?? "",
    provincia: property?.provincia ?? "",
    zona: property?.zona ?? "",
    indirizzo: property?.indirizzo ?? "",
    priceEur: property ? String(property.priceEur) : "",
    squareMeters: property ? String(property.squareMeters) : "",
    rooms: property?.rooms == null ? "" : String(property.rooms),
    bathrooms: property?.bathrooms == null ? "" : String(property.bathrooms),
    floor: property?.floor ?? "",
    energyClass: property?.energyClass ?? "",
    description: property?.description ?? "",
    listingType: property?.listingType ?? "",
    // `<input type="date">` accetta solo `YYYY-MM-DD`: passargli un ISO
    // completo lo lascia vuoto senza dire perche'.
    mandateExpiration: property?.mandateExpiration?.slice(0, 10) ?? "",
    commissionRate: property?.commissionRate == null ? "" : String(property.commissionRate),
    keysLocation: property?.keysLocation ?? "",
  });
  const [keysInOffice, setKeysInOffice] = useState(property?.keysInOffice ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  /** Doppione: confronto senza distinzione fra maiuscole, come lo scriverebbe. */
  const riferimentoOccupato =
    inCreazione &&
    form.reference.trim().length > 0 &&
    riferimentiEsistenti.some(
      (esistente) => esistente.trim().toLowerCase() === form.reference.trim().toLowerCase()
    );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, isSaving]);

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        inCreazione ? "/api/properties" : `/api/properties/${property.id}`,
        {
        method: inCreazione ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: form.reference.trim(),
          title: form.title.trim(),
          contract: form.contract,
          type: form.type,
          comune: form.comune.trim(),
          provincia: toText(form.provincia),
          zona: toText(form.zona),
          indirizzo: toText(form.indirizzo),
          priceEur: toNumber(form.priceEur),
          squareMeters: toNumber(form.squareMeters),
          rooms: toNumber(form.rooms),
          bathrooms: toNumber(form.bathrooms),
          floor: toText(form.floor),
          energyClass: toText(form.energyClass),
          description: toText(form.description),
          listingType: form.listingType || null,
          mandateExpiration: form.mandateExpiration || null,
          // `toNumber` fa parseInt e perderebbe il 3,5%: la provvigione ha
          // decimali per definizione.
          commissionRate: toDecimal(form.commissionRate),
          keysInOffice,
          // Le note sulle chiavi non hanno senso senza le chiavi: se il
          // toggle e' spento si azzerano, invece di restare a indicare
          // l'ubicazione di qualcosa che non abbiamo.
          keysLocation: keysInOffice ? toText(form.keysLocation) ?? null : null,
        }),
        }
      );

      const data = (await response.json().catch(() => null)) as
        | { property?: EditableProperty; error?: string; issues?: string[] }
        | null;

      if (!response.ok) {
        // I messaggi di validazione arrivano dallo schema condiviso col
        // server: ripeterli qui a mano li farebbe divergere alla prima
        // modifica di una regola.
        setError(
          data?.issues?.[0] ??
            MESSAGGI[data?.error ?? ""] ??
            "Salvataggio non riuscito. Controlla i campi e riprova."
        );
        return;
      }

      if (inCreazione) {
        /*
         * La creazione risponde con l'id e l'esito dello Smart Matching, non
         * con la scheda intera: il portafoglio si ricarica invece di essere
         * aggiornato a mano. È un immobile in più su una lista già a schermo,
         * non vale il rischio di tenerne due copie divergenti.
         */
        const abbinati = (data as { matching?: { matched?: number } } | null)?.matching?.matched ?? 0;
        showToast(
          abbinati > 0
            ? `Immobile aggiunto. ${abbinati} ${abbinati === 1 ? "lead compatibile" : "lead compatibili"} in portafoglio.`
            : "Immobile aggiunto al portafoglio.",
          "success"
        );
        onCreated?.();
        onClose();
        return;
      }

      if (data?.property) onSaved(data.property);
      showToast("Scheda immobile aggiornata.", "success");
      onClose();
    } catch {
      setError("Salvataggio non riuscito. Riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="fixed inset-0 bg-black/50" onClick={isSaving ? undefined : onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modifica-immobile"
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-xl border border-border bg-card shadow-xl sm:rounded-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 id="modifica-immobile" className="text-sm font-semibold text-foreground">
              {inCreazione ? "Nuovo immobile in portafoglio" : "Modifica scheda immobile"}
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {property
                  ? `Rif. ${property.reference}`
                  : "Riferimento, comune, prezzo e superficie sono i campi che i portali pretendono."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Chiudi"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-all duration-200 hover:bg-muted disabled:opacity-50 sm:h-8 sm:w-8"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="ed-title" className="text-xs font-medium text-foreground">
                Titolo dell&apos;annuncio
              </label>
              <input
                id="ed-title"
                className="input-field mt-1"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-ref" className="text-xs font-medium text-foreground">
                Riferimento
              </label>
              <input
                id="ed-ref"
                className="input-field mt-1"
                value={form.reference}
                onChange={(e) => set("reference", e.target.value)}
                aria-invalid={riferimentoOccupato}
                aria-describedby={riferimentoOccupato ? "ed-ref-errore" : undefined}
              />
              {riferimentoOccupato && (
                <p id="ed-ref-errore" className="mt-1 text-xs text-status-blocked">
                  Esiste già un immobile con questo riferimento. Cambialo, oppure modifica
                  quello esistente dal portafoglio.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="ed-price" className="text-xs font-medium text-foreground">
                Prezzo (€)
              </label>
              <input
                id="ed-price"
                inputMode="numeric"
                className="input-field mt-1"
                value={form.priceEur}
                onChange={(e) => set("priceEur", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-contract" className="text-xs font-medium text-foreground">
                Contratto
              </label>
              <select
                id="ed-contract"
                className="input-field mt-1"
                value={form.contract}
                onChange={(e) => set("contract", e.target.value)}
              >
                {Object.entries(CONTRACT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ed-type" className="text-xs font-medium text-foreground">
                Tipologia
              </label>
              <select
                id="ed-type"
                className="input-field mt-1"
                value={form.type}
                onChange={(e) => set("type", e.target.value)}
              >
                {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ed-comune" className="text-xs font-medium text-foreground">
                Comune
              </label>
              <input
                id="ed-comune"
                className="input-field mt-1"
                value={form.comune}
                onChange={(e) => set("comune", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-prov" className="text-xs font-medium text-foreground">
                Provincia
              </label>
              <input
                id="ed-prov"
                className="input-field mt-1"
                placeholder="MO"
                value={form.provincia}
                onChange={(e) => set("provincia", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-zona" className="text-xs font-medium text-foreground">
                Zona
              </label>
              <input
                id="ed-zona"
                className="input-field mt-1"
                value={form.zona}
                onChange={(e) => set("zona", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-indirizzo" className="text-xs font-medium text-foreground">
                Indirizzo
              </label>
              <input
                id="ed-indirizzo"
                className="input-field mt-1"
                value={form.indirizzo}
                onChange={(e) => set("indirizzo", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-mq" className="text-xs font-medium text-foreground">
                Superficie (mq)
              </label>
              <input
                id="ed-mq"
                inputMode="numeric"
                className="input-field mt-1"
                value={form.squareMeters}
                onChange={(e) => set("squareMeters", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-rooms" className="text-xs font-medium text-foreground">
                Locali
              </label>
              <input
                id="ed-rooms"
                inputMode="numeric"
                className="input-field mt-1"
                value={form.rooms}
                onChange={(e) => set("rooms", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-bagni" className="text-xs font-medium text-foreground">
                Bagni
              </label>
              <input
                id="ed-bagni"
                inputMode="numeric"
                className="input-field mt-1"
                value={form.bathrooms}
                onChange={(e) => set("bathrooms", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-piano" className="text-xs font-medium text-foreground">
                Piano
              </label>
              <input
                id="ed-piano"
                className="input-field mt-1"
                value={form.floor}
                onChange={(e) => set("floor", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-classe" className="text-xs font-medium text-foreground">
                Classe energetica
              </label>
              <select
                id="ed-classe"
                className="input-field mt-1"
                value={form.energyClass}
                onChange={(e) => set("energyClass", e.target.value)}
              >
                <option value="">Non indicata</option>
                {ENERGY_CLASSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="ed-desc" className="text-xs font-medium text-foreground">
                Descrizione
              </label>
              <textarea
                id="ed-desc"
                rows={8}
                className="input-field mt-1 resize-y"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                È il testo che finisce nel feed verso i portali.
              </p>
            </div>
          </div>

          {/*
            Sezione a sé, separata dal resto da una riga: i dati dell'incarico
            non descrivono l'immobile ma il rapporto con il proprietario, e
            mescolarli ai metri quadri li fa saltare a chi compila di fretta.
          */}
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <FileSignature className="h-3.5 w-3.5" />
              Dati mandato e incarico
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Facoltativi. La scadenza però conta: superata,{" "}
              <span className="font-medium text-foreground">
                l&apos;immobile esce dal feed verso i portali
              </span>{" "}
              — senza mandato valido non si può pubblicizzare.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ed-incarico" className="text-xs font-medium text-foreground">
                  Tipo di incarico
                </label>
                <select
                  id="ed-incarico"
                  className="input-field mt-1"
                  value={form.listingType}
                  onChange={(e) => set("listingType", e.target.value)}
                >
                  <option value="">Non indicato</option>
                  {(["ESCLUSIVA", "NON_ESCLUSIVA", "SELEZIONE"] as const).map((value) => (
                    <option key={value} value={value}>
                      {LISTING_TYPE_LABELS[value]}
                    </option>
                  ))}
                </select>
                {form.listingType ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {LISTING_TYPE_HINTS[form.listingType as ListingType]}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="ed-scadenza" className="text-xs font-medium text-foreground">
                  Scadenza incarico
                </label>
                <input
                  id="ed-scadenza"
                  type="date"
                  className="input-field mt-1"
                  value={form.mandateExpiration}
                  onChange={(e) => set("mandateExpiration", e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="ed-provvigione" className="text-xs font-medium text-foreground">
                  Provvigione agenzia (%)
                </label>
                <input
                  id="ed-provvigione"
                  inputMode="decimal"
                  placeholder="es. 3 oppure 3,5"
                  className="input-field mt-1"
                  value={form.commissionRate}
                  onChange={(e) => set("commissionRate", e.target.value)}
                />
              </div>

              <div>
                <span className="text-xs font-medium text-foreground">Chiavi</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={keysInOffice}
                  onClick={() => setKeysInOffice((current) => !current)}
                  className={cn(
                    "mt-1 flex h-11 w-full items-center gap-2 rounded-lg border px-3 text-sm transition-all duration-200 sm:h-10",
                    keysInOffice
                      ? "border-status-qualified/40 bg-status-qualified/10 text-foreground"
                      : "border-border-strong text-muted-foreground hover:bg-muted"
                  )}
                >
                  <KeyRound
                    className={cn(
                      "h-4 w-4 shrink-0",
                      keysInOffice ? "text-status-qualified" : "text-muted-foreground"
                    )}
                  />
                  {keysInOffice ? "Chiavi in agenzia" : "Chiavi non in agenzia"}
                </button>
              </div>

              {/* Il campo ubicazione compare solo con le chiavi in agenzia:
                  chiedere dove sono chiavi che non abbiamo e' una domanda
                  senza risposta. */}
              {keysInOffice ? (
                <div className="sm:col-span-2">
                  <label htmlFor="ed-chiavi" className="text-xs font-medium text-foreground">
                    Ubicazione e note
                  </label>
                  <input
                    id="ed-chiavi"
                    placeholder="es. cassetta 12, oppure: le ha il portiere"
                    className="input-field mt-1"
                    value={form.keysLocation}
                    onChange={(e) => set("keysLocation", e.target.value)}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {error ? <p className="mt-3 text-xs text-status-blocked">{error}</p> : null}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-border p-4">
          <button type="button" onClick={onClose} disabled={isSaving} className="btn-outline text-xs disabled:opacity-50">
            Annulla
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isSaving || riferimentoOccupato}
            className="btn-brand text-xs disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {isSaving
              ? "Salvataggio in corso…"
              : inCreazione
                ? "Salva in portafoglio"
                : "Salva modifiche"}
          </button>
        </footer>
      </div>
    </div>
  );
}
