"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGES_PER_PROPERTY } from "@/lib/listings/property-images";
import { downscaleToDataUrl } from "@/lib/listings/downscale";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/shared/toast-provider";

export function PropertyImagesEditor({
  propertyId,
  images,
  onChange,
}: {
  propertyId: string;
  images: string[];
  onChange: (next: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Foto in attesa di conferma: una cancellazione non si annulla. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const { showToast } = useToast();

  const remaining = MAX_IMAGES_PER_PROPERTY - images.length;

  async function upload(files: FileList) {
    setError(null);
    setIsBusy(true);

    // Una per volta e non in parallelo: sono richieste con un'immagine intera
    // nel corpo, e spedirne venti insieme da una rete mobile le fa scadere
    // tutte. In compenso la griglia si popola man mano.
    try {
      for (const file of Array.from(files).slice(0, Math.max(0, remaining))) {
        let dataUrl: string;
        try {
          dataUrl = await downscaleToDataUrl(file);
        } catch {
          setError(`Non riesco a leggere "${file.name}". Converti la foto in JPEG e riprova.`);
          continue;
        }

        const response = await fetch(`/api/properties/${propertyId}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(
            payload?.error === "too_many_images"
              ? `Massimo ${MAX_IMAGES_PER_PROPERTY} foto per immobile.`
              : "Caricamento non riuscito. Riprova."
          );
          break;
        }

        const data = (await response.json()) as { images: string[] };
        onChange(data.images);
      }
    } finally {
      setIsBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // Si identifica la foto con l'URL memorizzato e non con un id: con l'object
  // storage attivo una foto non ha una riga nel database, e i pulsanti
  // sparirebbero per meta' dell'archivio.
  async function mutate(method: "DELETE" | "PATCH", image: string, fallback: string) {
    setError(null);
    setIsBusy(true);
    try {
      const response = await fetch(`/api/properties/${propertyId}/images`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { images: string[] };
      onChange(data.images);
      showToast(method === "DELETE" ? "Foto eliminata." : "Copertina aggiornata.", "success");
    } catch {
      setError(fallback);
      showToast(fallback, "error");
    } finally {
      setIsBusy(false);
      setConfirming(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Fotografie{images.length > 0 ? ` · ${images.length}/${MAX_IMAGES_PER_PROPERTY}` : ""}
        </h3>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isBusy || remaining <= 0}
          className="btn-outline text-xs disabled:opacity-50"
        >
          {isBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImagePlus className="h-3.5 w-3.5" />
          )}
          Aggiungi foto
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ALLOWED_IMAGE_MIME_TYPES.join(",")}
          className="sr-only"
          onChange={(event) => {
            if (event.target.files?.length) void upload(event.target.files);
          }}
        />
      </div>

      {images.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Nessuna foto. I portali pubblicano l&apos;annuncio anche senza, ma in ricerca compare
          senza immagine e viene aperto molto meno.
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {images.map((image, index) => (
              <li
                key={image}
                className="relative h-24 w-24 overflow-hidden rounded-lg border border-border bg-muted sm:h-20 sm:w-20"
              >
                {/* Immagine in una griglia di gestione: il testo alternativo
                    utile è la posizione, non una descrizione della casa che
                    non abbiamo. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image}
                  alt={index === 0 ? "Foto di copertina" : `Foto ${index + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />

                {index === 0 ? (
                  <span className="absolute inset-x-0 top-0 bg-brand-navy/80 px-1 py-0.5 text-center text-[10px] font-medium text-white">
                    Copertina
                  </span>
                ) : null}

                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-1">
                  {index !== 0 ? (
                    <button
                      type="button"
                      onClick={() => mutate("PATCH", image, "Copertina non aggiornata.")}
                      disabled={isBusy}
                      aria-label={`Usa la foto ${index + 1} come copertina`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-black/50 text-white transition-colors hover:bg-black/75 disabled:opacity-50 sm:h-7 sm:w-7"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setConfirming(image)}
                    disabled={isBusy}
                    aria-label={`Elimina la foto ${index + 1}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-black/50 text-white transition-colors hover:bg-status-blocked disabled:opacity-50 sm:h-7 sm:w-7"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
          ))}
        </ul>
      )}

      {confirming && (
        <ConfirmDialog
          title="Eliminare questa fotografia?"
          description="Sparisce dalla scheda e dal feed verso i portali. Per rimetterla dovrai caricarla di nuovo."
          confirmLabel="Elimina la foto"
          cancelLabel="Torna indietro"
          isWorking={isBusy}
          onConfirm={() => mutate("DELETE", confirming, "Foto non rimossa.")}
          onCancel={() => setConfirming(null)}
        />
      )}

      {error ? <p className="mt-2 text-xs text-status-blocked">{error}</p> : null}
    </div>
  );
}
