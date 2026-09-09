"use client";

import { useEffect, useState } from "react";
import { Check, FileUp, Loader2, MapPin, X } from "lucide-react";
import { PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";
import { cn } from "@/lib/utils";
import type { AuctionStatus, PropertyType } from "@prisma/client";
import { AUCTION_STATUS_LABELS, RADAR_TAGS } from "@/lib/radar/tags";
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

  /*
   * La bozza nata dalla perizia, quando si parte dal PDF.
   *
   * Da qui in giu' i valori iniziali del modulo si leggono da `base`, che e'
   * la scheda in modifica oppure la bozza appena analizzata: e' cio' che
   * permette al modulo di aprirsi gia' compilato invece che vuoto.
   */
  const [bozza, setBozza] = useState<RadarItem | null>(null);
  const base = item ?? bozza;

  /*
   * Da dove si parte: dal PDF o dalla tastiera.
   *
   * "scelta" e' il primo schermo di una scheda nuova, e mostra la perizia
   * come strada principale. Chi modifica un lotto gia' in elenco non lo vede
   * mai: li' i dati ci sono gia', e ripartire dal caricamento sarebbe un
   * passaggio in piu' verso qualcosa che si voleva solo correggere.
   */
  const [modo, setModo] = useState<"scelta" | "form">(modifica ? "form" : "scelta");
  const [faseAnalisi, setFaseAnalisi] = useState<string | null>(null);

  /**
   * Crea la scheda dalla perizia e attende che l'analisi finisca.
   *
   * # Perche' si interroga invece di aspettare la risposta
   *
   * Perche' leggere una perizia richiede molto piu' di quanto una richiesta
   * HTTP possa restare aperta: la rotta risponde 202 appena la scheda esiste,
   * e il lavoro prosegue sul server. Qui si chiede lo stato finche' non e'
   * pronto, dicendo a che punto siamo — un'attesa muta di un minuto su un
   * pannello fermo si legge come un blocco.
   */
  async function analizzaPerizia(file: File) {
    if (file.type !== "application/pdf") {
      setError("La perizia deve essere un PDF.");
      return;
    }

    setError(null);
    setFaseAnalisi("Caricamento della perizia…");

    try {
      const modulo = new FormData();
      modulo.append("file", file);
      modulo.append("kind", kind);

      const risposta = await fetch("/api/radar/properties/from-appraisal", {
        method: "POST",
        body: modulo,
      });
      const corpo = await risposta.json().catch(() => null);

      if (!risposta.ok) {
        setError(corpo?.message ?? "Caricamento non riuscito. Riprova.");
        setFaseAnalisi(null);
        return;
      }

      const idBozza = corpo.radarPropertyId as string;
      setFaseAnalisi("Lettura della perizia in corso…");

      /*
       * Il tetto sui tentativi non e' prudenza: e' il limite reale.
       *
       * L'analisi gira dentro `after()`, quindi non puo' superare il
       * `maxDuration` della funzione. Oltre quel tempo lo stato resta
       * IN_ANALISI perche' l'invocazione e' stata troncata, e continuare a
       * interrogare per sempre lascerebbe l'agente davanti a una rotella che
       * non si ferma mai.
       */
      for (let tentativo = 0; tentativo < 30; tentativo += 1) {
        await new Promise((r) => setTimeout(r, 3000));

        if (tentativo === 3) setFaseAnalisi("Estrazione dei dati catastali…");
        if (tentativo === 8) setFaseAnalisi("Analisi di difformità e vincoli…");
        if (tentativo === 15) setFaseAnalisi("Ancora al lavoro: la perizia è lunga…");

        const stato = await fetch(`/api/radar/properties/${idBozza}/appraisal`);
        const datiStato = await stato.json().catch(() => null);
        const situazione = datiStato?.appraisal?.status;

        if (situazione === "PRONTA" || situazione === "FALLITA") {
          const scheda = await fetch(`/api/radar/properties/${idBozza}`);
          const datiScheda = await scheda.json().catch(() => null);
          if (datiScheda?.item) setBozza(datiScheda.item as RadarItem);

          if (situazione === "FALLITA") {
            // La scheda esiste comunque e il credito e' speso: si passa al
            // modulo con i campi vuoti invece di far ricominciare da capo.
            setError(
              datiStato?.appraisal?.failureReason ??
                "L'analisi non è riuscita. I campi restano da compilare a mano."
            );
          }

          setFaseAnalisi(null);
          setModo("form");
          return;
        }
      }

      setError(
        "L'analisi sta impiegando più del previsto. La scheda è salvata: riapri il lotto fra poco per vedere l'esito."
      );
      setFaseAnalisi(null);
    } catch {
      setError("Errore di rete durante il caricamento della perizia.");
      setFaseAnalisi(null);
    }
  }

  const [kind, setKind] = useState<"ASTA" | "RIBASSO">(base?.kind ?? "ASTA");
  const [step, setStep] = useState<1 | 2>(1);
  const [salvato, setSalvato] = useState<RadarItem | null>(item);
  const [tags, setTags] = useState<string[]>(base?.tags ?? []);
  const [auctionStatus, setAuctionStatus] = useState<AuctionStatus | "">(
    base?.auctionStatus ?? ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Errori per campo, come li restituisce la rotta.
   *
   * Un messaggio unico in cima a quattordici campi non dice quale
   * correggere: si prova a caso finche' non si rinuncia.
   */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
      tags,
      auctionStatus: auctionStatus || null,
      ...(coord ? { latitude: coord.lat, longitude: coord.lng } : {}),
    };

    setIsSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await fetch(
        base ? `/api/radar/properties/${base.id}` : "/api/radar/properties",
        {
          method: base ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        }
      );
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setFieldErrors(body?.fieldErrors ?? {});
        setError(body?.message ?? `Salvataggio non riuscito (errore ${response.status}).`);
        return;
      }

      const salvatoOra = {
        ...(item ?? {}),
        ...body.item,
        appraisal: base?.appraisal ?? null,
        _count: base?._count ?? { matches: 0 },
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
    <div className="fixed inset-0 z-50 flex h-[100dvh] justify-end">
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
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground sm:h-8 sm:w-8 transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {step === 1 && modo === "scelta" ? (
            /* Prima schermata di una scheda nuova: la perizia in evidenza.

               Prima si arrivava qui e si trovava un modulo da riempire, con il
               caricamento del PDF relegato al passo due — cioe' si ricopiavano
               a mano comune, tipologia, superficie e offerta minima da un
               documento che il sistema sa leggere. Ora quei campi li porta il
               PDF e all'agente resta la verifica. */
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Carica la Perizia Giudiziaria (PDF)
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Da qui ricaviamo comune, indirizzo, tipologia, superficie, valore di stima, data
                  d&apos;asta e lotto, piu&apos; stato occupazionale, difformita&apos; e vincoli.
                  Tu verifichi e confermi.
                </p>
              </div>

              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file && !faseAnalisi) void analizzaPerizia(file);
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center transition-colors duration-200",
                  faseAnalisi
                    ? "border-primary bg-primary/5"
                    : "border-border-strong hover:border-primary/50 hover:bg-muted/50"
                )}
              >
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={Boolean(faseAnalisi)}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void analizzaPerizia(file);
                  }}
                />
                {faseAnalisi ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-sm font-medium text-foreground">{faseAnalisi}</span>
                    <span className="text-xs text-muted-foreground">
                      Puoi lasciare aperto: l&apos;analisi prosegue sul server.
                    </span>
                  </>
                ) : (
                  <>
                    <FileUp className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      Trascina qui la perizia, o scegli il file
                    </span>
                    <span className="text-xs text-muted-foreground">PDF fino a 15 MB</span>
                  </>
                )}
              </label>

              {error && (
                <p role="alert" className="text-sm text-status-blocked">
                  {error}
                </p>
              )}

              {/* La strada senza PDF resta, ma non compete con la principale:
                  serve ai ribassi di mercato e alle occasioni da privato, dove
                  una perizia non esiste proprio. */}
              <button
                type="button"
                disabled={Boolean(faseAnalisi)}
                onClick={() => setModo("form")}
                className="h-11 w-full rounded-lg border border-border text-xs font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted disabled:opacity-50 sm:h-9"
              >
                Inserisci senza PDF / Opportunità da privato
              </button>
            </div>
          ) : step === 1 ? (
            <form key={base?.id ?? "nuovo"} id="radar-form" onSubmit={submit} className="space-y-4">
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
                <Campo id="d-comune" label="Comune" required error={fieldErrors.comune}>
                  <input id="d-comune" aria-invalid={Boolean(fieldErrors.comune)} name="comune" defaultValue={base?.comune ?? ""} required maxLength={120} className="input-field h-11 sm:h-9 w-full text-base sm:text-sm" />
                </Campo>
                <Campo id="d-zona" label="Zona o frazione" error={fieldErrors.zona}>
                  <input id="d-zona" name="zona" defaultValue={base?.zona ?? ""} maxLength={120} className="input-field h-11 sm:h-9 w-full text-base sm:text-sm" />
                </Campo>
              </div>

              <Campo id="d-address" label="Indirizzo e civico" hint="porta il pin sul portone" error={fieldErrors.address}>
                <input id="d-address" name="address" defaultValue={base?.address ?? ""} placeholder="Es. Via Emilia 45" maxLength={200} className="input-field h-11 sm:h-9 w-full text-base sm:text-sm" />
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
                    className="inline-flex h-11 items-center sm:h-8 gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 disabled:opacity-50"
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
                <Campo id="d-type" label="Tipologia" required error={fieldErrors.type}>
                  <select id="d-type" name="type" required defaultValue={base?.type ?? "APPARTAMENTO"} className="input-field h-11 sm:h-9 w-full text-base sm:text-sm">
                    {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((t) => (
                      <option key={t} value={t}>
                        {PROPERTY_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo id="d-mq" label="Metri quadri" required error={fieldErrors.squareMeters}>
                  <input id="d-mq" aria-invalid={Boolean(fieldErrors.squareMeters)} name="squareMeters" defaultValue={base?.squareMeters ?? ""} required inputMode="numeric" className="input-field h-11 sm:h-9 w-full text-base sm:text-sm" />
                </Campo>

                <Campo id="d-prezzo" label={kind === "ASTA" ? "Offerta minima (€)" : "Prezzo attuale (€)"} required hint={modifica ? "abbassandolo si registra il ribasso" : undefined} error={fieldErrors.priceEur}>
                  <input id="d-prezzo" aria-invalid={Boolean(fieldErrors.priceEur)} name="priceEur" defaultValue={base?.priceEur ?? ""} required inputMode="numeric" className="input-field h-11 sm:h-9 w-full text-base sm:text-sm" />
                </Campo>

                {kind === "ASTA" ? (
                  <Campo id="d-base" label="Valore di perizia (€)" hint="lo ricava anche dalla perizia" error={fieldErrors.basePriceEur}>
                    <input id="d-base" name="basePriceEur" defaultValue={base?.basePriceEur ?? ""} inputMode="numeric" className="input-field h-11 sm:h-9 w-full text-base sm:text-sm" />
                  </Campo>
                ) : (
                  <Campo id="d-prec" label="Prezzo precedente (€)" hint="per calcolare il ribasso" error={fieldErrors.previousPriceEur}>
                    <input id="d-prec" name="previousPriceEur" defaultValue={base?.previousPriceEur ?? ""} inputMode="numeric" className="input-field h-11 sm:h-9 w-full text-base sm:text-sm" />
                  </Campo>
                )}

                {kind === "ASTA" && (
                  <>
                    <Campo id="d-data" label="Data dell'asta" error={fieldErrors.auctionDate}>
                      <input id="d-data" name="auctionDate" type="date" defaultValue={base?.auctionDate ? base.auctionDate.slice(0, 10) : ""} className="input-field h-11 sm:h-9 w-full text-base sm:text-sm" />
                    </Campo>
                    <Campo id="d-lotto" label="Lotto" error={fieldErrors.lotto}>
                      <input id="d-lotto" name="lotto" defaultValue={base?.lotto ?? ""} maxLength={60} className="input-field h-11 sm:h-9 w-full text-base sm:text-sm" />
                    </Campo>
                  </>
                )}

                <Campo id="d-url" label="Link all'annuncio" error={fieldErrors.sourceUrl}>
                  <input id="d-url" name="sourceUrl" type="url" defaultValue={base?.sourceUrl ?? ""} maxLength={500} className="input-field h-11 sm:h-9 w-full text-base sm:text-sm" />
                </Campo>
              </div>

              {kind === "ASTA" && (
                <Campo id="d-stato" label="Fase della vendita" error={fieldErrors.auctionStatus}>
                  <select
                    id="d-stato"
                    value={auctionStatus}
                    onChange={(e) => setAuctionStatus(e.target.value as AuctionStatus | "")}
                    className="input-field h-11 sm:h-9 w-full text-base sm:text-sm"
                  >
                    <option value="">Non indicata</option>
                    {(Object.keys(AUCTION_STATUS_LABELS) as AuctionStatus[]).map((v) => (
                      <option key={v} value={v}>
                        {AUCTION_STATUS_LABELS[v]}
                      </option>
                    ))}
                  </select>
                </Campo>
              )}

              <div>
                <span className="text-xs font-medium text-foreground">
                  Etichette <span className="font-normal text-muted-foreground">(facoltative)</span>
                </span>
                {/* Insieme chiuso: sono il criterio di un filtro, e con la
                    scrittura libera "reddito" e "a reddito" diventerebbero due
                    categorie che nessun filtro rimette insieme. */}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {RADAR_TAGS.map((tag) => {
                    const attivo = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={attivo}
                        onClick={() =>
                          setTags((current) =>
                            attivo ? current.filter((t) => t !== tag) : [...current, tag]
                          )
                        }
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-200",
                          attivo
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Lo stato occupazionale non è fra le etichette: lo ricava la perizia, ed è
                  mostrato in scheda.
                </p>
              </div>

              <Campo id="d-note" label="Note" error={fieldErrors.notes}>
                <textarea id="d-note" name="notes" defaultValue={base?.notes ?? ""} rows={2} maxLength={2000} className="input-field w-full resize-y text-base sm:text-sm" />
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

        {/*
          Spazio in fondo, non solo padding.
          Il widget della chat galleggia in basso a destra: senza margine i
          tasti del pannello gli finiscono sotto proprio sul telefono, dove il
          widget e' piu' in alto per scavalcare la barra di navigazione. Il
          margine e' sul lato basso e non simmetrico, perche' il problema sta
          li'.
        */}
        <footer className="flex items-center justify-end gap-2 border-t border-border p-4 pb-10 sm:pb-6">
          <button
            type="button"
            onClick={onClose}
            className="h-11 sm:h-9 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted"
          >
            {step === 2 ? "Chiudi" : "Annulla"}
          </button>
          {step === 1 && modo === "form" && (
            <button
              type="submit"
              form="radar-form"
              disabled={isSaving}
              className="inline-flex h-11 items-center sm:h-9 gap-1.5 rounded-lg bg-brand-gradient px-3 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50"
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
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
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
      {/*
        Il bordo rosso si applica al contenitore e ricade sull'input: cosi'
        vale per `input`, `select` e `textarea` senza doverli toccare uno per
        uno. `aria-invalid` sta sul campo vero, dove un lettore di schermo lo
        cerca.
      */}
      <div
        className={cn(
          "mt-1.5",
          error && "[&_input]:border-status-blocked [&_select]:border-status-blocked [&_textarea]:border-status-blocked"
        )}
      >
        {children}
      </div>
      {error && (
        <p className="mt-1 text-xs text-status-blocked" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
