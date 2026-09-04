"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Images,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { ALLOWED_IMAGE_MIME_TYPES } from "@/lib/listings/property-images";
import { downscaleToDataUrl } from "@/lib/listings/downscale";
import { useToast } from "@/components/shared/toast-provider";
import { MAX_SOCIAL_MEDIA } from "@/lib/social/media-limits";
import { cn } from "@/lib/utils";

/**
 * Foto da allegare al post social.
 *
 * # Perché due strade e non una
 *
 * Perché sono due momenti diversi. Le foto dell'immobile esistono già in
 * portafoglio — ricaricarle a mano per pubblicare lo stesso appartamento è
 * lavoro doppio — ma un post non è sempre un annuncio: una locandina, una foto
 * scattata al volo o una grafica per una campagna non stanno in nessuna scheda,
 * e senza il caricamento locale l'agenzia dovrebbe inventarsi un immobile finto
 * per pubblicarle.
 *
 * # Perché solo immagini
 *
 * Perché il video oggi non arriverebbe a destinazione, e un pulsante che
 * fallisce sempre è peggio di un pulsante assente. Manca l'object storage
 * (`STORAGE_BUCKET_URL` non è configurata): un MP4 finirebbe come data URI in
 * PostgreSQL, dove le foto sono già limitate a 2 MB. Instagram inoltre
 * pubblica i video in modo asincrono — si crea il contenitore, si aspetta che
 * passi a FINISHED, e solo allora si pubblica — e quell'attesa supera il
 * minuto che la funzione ha a disposizione.
 */

interface ImmobileConFoto {
  id: string;
  reference: string;
  title: string;
  images: string[];
}

export function MediaAttachments({
  media,
  onChange,
}: {
  media: string[];
  onChange: (next: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mostraPortafoglio, setMostraPortafoglio] = useState(false);
  const { showToast } = useToast();

  const rimanenti = MAX_SOCIAL_MEDIA - media.length;

  async function carica(files: FileList | File[]) {
    const scelti = Array.from(files).slice(0, Math.max(0, rimanenti));
    if (scelti.length === 0) {
      showToast(`Puoi allegare al massimo ${MAX_SOCIAL_MEDIA} foto.`, "error");
      return;
    }

    setIsBusy(true);
    const aggiunti: string[] = [];

    try {
      for (const file of scelti) {
        /*
         * Il video si ferma qui, con la ragione scritta.
         *
         * Lasciarlo passare significherebbe un errore dell'API di Meta a
         * pubblicazione avviata, cioè nel momento peggiore: l'agente ha già
         * scritto il testo e crede di aver finito.
         */
        if (file.type.startsWith("video/")) {
          showToast("I video non sono ancora supportati: allega una foto.", "error");
          continue;
        }

        if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
          showToast(`${file.name}: formato non supportato (JPG, PNG o WebP).`, "error");
          continue;
        }

        const dataUrl = await downscaleToDataUrl(file);
        const response = await fetch("/api/social/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          showToast(body.message ?? "Caricamento non riuscito.", "error");
          continue;
        }

        aggiunti.push(body.url as string);
      }

      if (aggiunti.length > 0) onChange([...media, ...aggiunti]);
    } catch {
      showToast("Non è stato possibile leggere il file.", "error");
    } finally {
      setIsBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function rimuovi(indice: number) {
    onChange(media.filter((_, i) => i !== indice));
  }

  /*
   * Riordino con le frecce, non trascinando.
   *
   * Il trascinamento su touch confligge con lo scorrimento della pagina, ed è
   * proprio da telefono che l'agente prepara un post fra un appuntamento e
   * l'altro. Due frecce funzionano ovunque e si usano anche da tastiera.
   */
  function sposta(indice: number, direzione: -1 | 1) {
    const destinazione = indice + direzione;
    if (destinazione < 0 || destinazione >= media.length) return;
    const next = [...media];
    const corrente = next[indice];
    const altro = next[destinazione];
    if (corrente === undefined || altro === undefined) return;
    next[indice] = altro;
    next[destinazione] = corrente;
    onChange(next);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Allegati multimediali</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Instagram non pubblica post di solo testo: senza almeno una foto resta disponibile il
            solo Facebook.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {media.length} / {MAX_SOCIAL_MEDIA}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMostraPortafoglio(true)}
          disabled={isBusy || rimanenti <= 0}
          className="btn-outline text-xs disabled:opacity-50"
        >
          <Images className="h-3.5 w-3.5" />
          Seleziona da Portafoglio Immobili
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isBusy || rimanenti <= 0}
          className="btn-outline text-xs disabled:opacity-50"
        >
          {isBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImagePlus className="h-3.5 w-3.5" />
          )}
          Carica dal computer
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_IMAGE_MIME_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(e) => e.target.files && carica(e.target.files)}
        />
      </div>

      {/* Area di trascinamento: la stessa zona accetta anche il rilascio. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files.length > 0) void carica(e.dataTransfer.files);
        }}
        className={cn(
          "mt-3 rounded-lg border border-dashed px-3 py-6 text-center text-xs transition-colors duration-200",
          isDragging
            ? "border-primary bg-primary/5 text-primary"
            : "border-border text-muted-foreground"
        )}
      >
        Trascina qui le foto, oppure usa i pulsanti sopra. JPG, PNG o WebP.
      </div>

      {media.length > 0 && (
        <>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {media.map((url, indice) => (
              <li
                key={`${url}-${indice}`}
                className="group relative overflow-hidden rounded-lg border border-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Allegato ${indice + 1}`}
                  className="aspect-square w-full object-cover"
                />

                {indice === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Copertina
                  </span>
                )}

                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-1 py-1">
                  <button
                    type="button"
                    onClick={() => sposta(indice, -1)}
                    disabled={indice === 0}
                    aria-label="Sposta indietro"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-white transition-colors hover:bg-white/20 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => rimuovi(indice)}
                    aria-label="Rimuovi"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-white transition-colors hover:bg-status-blocked/80"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => sposta(indice, 1)}
                    disabled={indice === media.length - 1}
                    aria-label="Sposta avanti"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-white transition-colors hover:bg-white/20 disabled:opacity-30"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            La prima foto è la copertina del post. Usa le frecce per riordinarle.
          </p>
        </>
      )}

      {mostraPortafoglio && (
        <PortfolioPicker
          rimanenti={rimanenti}
          giaScelte={media}
          onPick={(urls) => onChange([...media, ...urls])}
          onClose={() => setMostraPortafoglio(false)}
        />
      )}
    </div>
  );
}

/**
 * Sceglie fra le foto già caricate sulle schede immobile.
 *
 * Mostra solo gli immobili che hanno almeno una foto: elencare schede vuote
 * farebbe scorrere l'intero portafoglio per scoprire che non c'è niente da
 * prendere.
 */
function PortfolioPicker({
  rimanenti,
  giaScelte,
  onPick,
  onClose,
}: {
  rimanenti: number;
  giaScelte: string[];
  onPick: (urls: string[]) => void;
  onClose: () => void;
}) {
  const [immobili, setImmobili] = useState<ImmobileConFoto[] | null>(null);
  const [selezione, setSelezione] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/properties")
      .then((r) => (r.ok ? r.json() : null))
      .then((dati) => {
        const elenco = (dati?.properties ?? []) as ImmobileConFoto[];
        setImmobili(
          Array.isArray(elenco) ? elenco.filter((p) => (p.images?.length ?? 0) > 0) : []
        );
      })
      .catch(() => setImmobili([]));
  }, []);

  function commuta(url: string) {
    setSelezione((corrente) =>
      corrente.includes(url)
        ? corrente.filter((u) => u !== url)
        : corrente.length < rimanenti
          ? [...corrente, url]
          : corrente
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scegli le foto dal portafoglio"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Foto dal Portafoglio Immobili</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {immobili === null ? (
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Caricamento…
          </p>
        ) : immobili.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Nessun immobile in portafoglio ha fotografie. Caricale dalla scheda dell&apos;immobile,
            oppure usa &laquo;Carica dal computer&raquo;.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {immobili.map((immobile) => (
              <div key={immobile.id}>
                <p className="text-xs font-semibold text-foreground">
                  {immobile.reference} &middot; {immobile.title}
                </p>
                <ul className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {immobile.images.map((url) => {
                    const scelta = selezione.includes(url);
                    const gia = giaScelte.includes(url);
                    return (
                      <li key={url}>
                        <button
                          type="button"
                          onClick={() => !gia && commuta(url)}
                          disabled={gia}
                          aria-pressed={scelta}
                          className={cn(
                            "relative block w-full overflow-hidden rounded-lg border-2 transition-all duration-200",
                            gia
                              ? "cursor-not-allowed border-border opacity-40"
                              : scelta
                                ? "border-primary"
                                : "border-transparent hover:border-primary/40"
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="aspect-square w-full object-cover" />
                          {gia && (
                            <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-[10px] text-white">
                              già allegata
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {selezione.length} selezionate &middot; puoi aggiungerne ancora {rimanenti}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-outline text-xs">
              Annulla
            </button>
            <button
              type="button"
              disabled={selezione.length === 0}
              onClick={() => {
                onPick(selezione);
                onClose();
              }}
              className="btn-brand text-xs disabled:opacity-50"
            >
              Aggiungi al post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
