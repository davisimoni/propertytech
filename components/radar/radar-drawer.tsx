"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, MapPin, X } from "lucide-react";
import { PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";
import { cn } from "@/lib/utils";
import type { PropertyType } from "@prisma/client";
import type { RadarItem } from "./radar-board";
import { AppraisalPanel } from "./appraisal-panel";

/**
 * Inserimento e modifica di un lotto, in un pannello laterale.
 *
 * # Perché un pannello e non un modulo in pagina
 *
 * Il form ha quattordici campi. In pagina spingeva l'elenco fuori dallo
 * schermo ogni volta che qualcuno lo apriva, e chi voleva solo controllare un
 * prezzo si ritrovava a scorrere. Il pannello copre, non sposta: si chiude e
 * l'elenco è dove lo si era lasciato.
 *
 * # Perché due passi e non uno
 *
 * I dati del lotto e la perizia sono due momenti diversi. Il primo si compila
 * guardando un annuncio e dura un minuto; il secondo richiede di avere il PDF
 * sottomano, che spesso arriva dopo. Metterli nella stessa schermata fa
 * sembrare la perizia obbligatoria per salvare, e chi non ce l'ha rinuncia a
 * registrare l'opportunità.
 *
 * Il secondo passo compare solo dopo il salvataggio, perché l'analisi ha
 * bisogno di un lotto a cui attaccarsi.
 */

const numero = (v: string): number | null => {
  const pulito = v.replace(/[.\s€]/g, "").trim();
  if (!pulito) return null;
  const n = Number(pulito);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export function RadarDrawer({
  item,
  onClose,
  onSaved,
}: {
  /** `null` per creare, un lotto per modificarlo. */
  item: RadarItem | null;
  onClose: () => void;
  onSaved: (item: RadarItem, creato: boolean) => void;
}) {
  const modifica = item !== null;

  const [kind, setKind] = useState<"ASTA" | "RIBASSO">(item?.kind ?? "ASTA");
  const [step, setStep] = useState<1 | 2>(1);
  const [salvato, setSalvato] = useState<RadarItem | null>(item);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [coord, setCoord] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  // Escape chiude, come da ogni pannello della piattaforma. Non è una
  // conferma: qui non si distrugge nulla, si abbandona una compilazione.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function cerca(form: HTMLFormElement) {
    const dati = new FormData(form);
    const comune = String(dati.get("comune") ?? "").trim();
    const zona = String(dati.get("zona") ?? "").trim();
    const address = String(dati.get("address") ?? "").trim();

    if (comune.length < 2) {
      setGeoMessage("Scrivi prima il comune.");
      return;
    }

    setIsLocating(true);
    setGeoMessage(null);
    try {
      const params = new URLSearchParams({
        comune,
        ...(zona ? { zona } : {}),
        ...(address ? { address } : {}),
      });
      const response = await fetch(`/api/radar/geocode?${params}`);
      const dati = await response.json().catch(() => null);

      if (!dati?.found) {
        setGeoMessage(
          "Posizione non trovata. Puoi salvare lo stesso: il lotto resta in elenco senza comparire sulla mappa."
        );
        return;
      }
      setCoord({ lat: dati.latitude, lng: dati.longitude, label: dati.label ?? comune });
    } catch {
      setGeoMessage("Ricerca non riuscita. Puoi salvare lo stesso.");
    } finally {
      setIsLocating(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const form = new FormData(event.currentTarget);
    const v = (n: string) => String(form.get(n) ?? "").trim();
    const data = v("auctionDate");

    const corpo = {
      kind,
      comune: v("comune"),
      zona: v("zona") || null,
      address: v("address") || null,
      type: v("type"),
      squareMeters: numero(v("squareMeters")),
      priceEur: numero(v("priceEur")),
      basePriceEur: numero(v("basePriceEur")),
      previousPriceEur: numero(v("previousPriceEur")),
      auctionDate: data ? new Date(`${data}T12:00:00`).toISOString() : null,
      lotto: v("lotto") || null,
      sourceUrl: v("sourceUrl") || null,
      notes: v("notes") || null,
      ...(coord ? { latitude: coord.lat, longitude: coord.lng } : {}),
    };

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        modifica ? `/api/radar/properties/${item!.id}` : "/api/radar/properties",
        {
          method: modifica ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        }
      );
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setError(body?.message ?? `Salvataggio non riuscito (errore ${response.status}).`);
        return;
      }

      const salvatoOra = {
        ...(item ?? {}),
        ...body.item,
        appraisal: item?.appraisal ?? null,
        _count: item?._count ?? { matches: 0 },
      } as RadarItem;

      setSalvato(salvatoOra);
      onSaved(salvatoOra, !modifica);
      // Al passo due, non alla chiusura: chi ha appena registrato un lotto ha
      // spesso la perizia sotto mano, ed è il momento in cui la carica.
      setStep(2);
    } catch {
      setError("Errore di rete. L'opportunità non è stata salvata.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Chiudi il pannello"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={modifica ? "Modifica opportunità" : "Nuova opportunità"}
        className="animate-rise-in relative flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {modifica ? "Modifica opportunità" : "Nuova opportunità"}
            </h2>
            <div className="mt-2 flex items-center gap-2">
              {([1, 2] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={n === 2 && !salvato}
                  onClick={() => setStep(n)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-200",
                    step === n
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
                  )}
                >
                  {n === 1 && salvato ? <Check className="h-3 w-3" /> : <span>{n}</span>}
                  {n === 1 ? "Dati e indirizzo" : "Perizia"}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {step === 1 ? (
            <form id="radar-form" onSubmit={submit} className="space-y-4">
              {!modifica && (
                <div className="inline-flex rounded-lg border border-border p-0.5">
                  {(
                    [
                      ["ASTA", "Asta giudiziaria"],
                      ["RIBASSO", "Ribasso di mercato"],
                    ] as const
                  ).map(([valore, etichetta]) => (
                    <button
                      key={valore}
                      type="button"
                      onClick={() => setKind(valore)}
                      aria-pressed={kind === valore}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                        kind === valore
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {etichetta}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Campo id="d-comune" label="Comune" required>
                  <input id="d-comune" name="comune" defaultValue={item?.comune ?? ""} required maxLength={120} className="input-field h-9 w-full text-base sm:text-sm" />
                </Campo>
                <Campo id="d-zona" label="Zona o frazione">
                  <input id="d-zona" name="zona" defaultValue={item?.zona ?? ""} maxLength={120} className="input-field h-9 w-full text-base sm:text-sm" />
                </Campo>
              </div>

              <Campo id="d-address" label="Indirizzo e civico" hint="porta il pin sul portone">
                <input id="d-address" name="address" defaultValue={item?.address ?? ""} placeholder="Es. Via Emilia 45" maxLength={200} className="input-field h-9 w-full text-base sm:text-sm" />
              </Campo>

              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isLocating}
                    onClick={(e) => {
                      const form = e.currentTarget.closest("form");
                      if (form) void cerca(form);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 disabled:opacity-50"
                  >
                    {isLocating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                    Trova sulla mappa
                  </button>
                  {coord && (
                    <span className="text-xs text-status-qualified">
                      {coord.label.split(",").slice(0, 3).join(", ")}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {geoMessage ??
                    "Facoltativo: senza coordinate il lotto resta in elenco ma non compare sulla mappa."}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Campo id="d-type" label="Tipologia" required>
                  <select id="d-type" name="type" required defaultValue={item?.type ?? "APPARTAMENTO"} className="input-field h-9 w-full text-base sm:text-sm">
                    {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((t) => (
                      <option key={t} value={t}>
                        {PROPERTY_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo id="d-mq" label="Metri quadri" required>
                  <input id="d-mq" name="squareMeters" defaultValue={item?.squareMeters ?? ""} required inputMode="numeric" className="input-field h-9 w-full text-base sm:text-sm" />
                </Campo>

                <Campo id="d-prezzo" label={kind === "ASTA" ? "Offerta minima (€)" : "Prezzo attuale (€)"} required hint={modifica ? "abbassandolo si registra il ribasso" : undefined}>
                  <input id="d-prezzo" name="priceEur" defaultValue={item?.priceEur ?? ""} required inputMode="numeric" className="input-field h-9 w-full text-base sm:text-sm" />
                </Campo>

                {kind === "ASTA" ? (
                  <Campo id="d-base" label="Valore di perizia (€)" hint="lo ricava anche dalla perizia">
                    <input id="d-base" name="basePriceEur" defaultValue={item?.basePriceEur ?? ""} inputMode="numeric" className="input-field h-9 w-full text-base sm:text-sm" />
                  </Campo>
                ) : (
                  <Campo id="d-prec" label="Prezzo precedente (€)" hint="per calcolare il ribasso">
                    <input id="d-prec" name="previousPriceEur" defaultValue={item?.previousPriceEur ?? ""} inputMode="numeric" className="input-field h-9 w-full text-base sm:text-sm" />
                  </Campo>
                )}

                {kind === "ASTA" && (
                  <>
                    <Campo id="d-data" label="Data dell'asta">
                      <input id="d-data" name="auctionDate" type="date" defaultValue={item?.auctionDate ? item.auctionDate.slice(0, 10) : ""} className="input-field h-9 w-full text-base sm:text-sm" />
                    </Campo>
                    <Campo id="d-lotto" label="Lotto">
                      <input id="d-lotto" name="lotto" defaultValue={item?.lotto ?? ""} maxLength={60} className="input-field h-9 w-full text-base sm:text-sm" />
                    </Campo>
                  </>
                )}

                <Campo id="d-url" label="Link all'annuncio">
                  <input id="d-url" name="sourceUrl" type="url" defaultValue={item?.sourceUrl ?? ""} maxLength={500} className="input-field h-9 w-full text-base sm:text-sm" />
                </Campo>
              </div>

              <Campo id="d-note" label="Note">
                <textarea id="d-note" name="notes" defaultValue={item?.notes ?? ""} rows={2} maxLength={2000} className="input-field w-full resize-y text-base sm:text-sm" />
              </Campo>

              {error && (
                <p role="alert" className="text-sm text-status-blocked">
                  {error}
                </p>
              )}
            </form>
          ) : (
            <div className="space-y-3">
              {salvato && <AppraisalPanel radarPropertyId={salvato.id} onChanged={() => undefined} />}
              <p className="text-xs leading-relaxed text-muted-foreground">
                Puoi caricare la perizia anche più tardi, dalla scheda del lotto. Il lotto è già
                salvato.
              </p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted"
          >
            {step === 2 ? "Chiudi" : "Annulla"}
          </button>
          {step === 1 && (
            <button
              type="submit"
              form="radar-form"
              disabled={isSaving}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-gradient px-3 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50"
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {modifica ? "Salva modifiche" : "Salva e continua"}
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}

function Campo({
  id,
  label,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
        {required && (
          <span className="text-status-blocked" aria-hidden="true">
            {" "}
            *
          </span>
        )}
        {hint && <span className="font-normal text-muted-foreground"> ({hint})</span>}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
