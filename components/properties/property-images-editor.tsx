"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  IMAGE_TARGET_LONG_EDGE,
  MAX_IMAGES_PER_PROPERTY,
} from "@/lib/listings/property-images";

/**
 * Riduce la foto **prima** di spedirla.
 *
 * Una foto da telefono pesa 6-10 MB: caricarla intera vorrebbe dire far
 * aspettare l'agente sulla rete mobile, che è esattamente dove si trova quando
 * esce da un sopralluogo. A 1920px di lato lungo la qualità resta quella che i
 * portali pubblicano, e il file scende sotto il mezzo megabyte.
 *
 * L'uscita è sempre JPEG: le foto di un immobile non hanno trasparenza da
 * preservare, e la conversione taglia ulteriormente il peso.
 */
async function downscaleToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, IMAGE_TARGET_LONG_EDGE / longEdge);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas non disponibile");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    bitmap.close();
  }
}

/** Estrae l'id dal percorso `/api/images/<id>`; `null` per gli URL esterni. */
function imageIdFromPath(path: string): string | null {
  const match = path.match(/^\/api\/images\/([^/?#]+)$/);
  return match?.[1] ?? null;
}

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

  async function mutate(method: "DELETE" | "PATCH", imageId: string, fallback: string) {
    setError(null);
    setIsBusy(true);
    try {
      const response = await fetch(`/api/properties/${propertyId}/images`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { images: string[] };
      onChange(data.images);
    } catch {
      setError(fallback);
    } finally {
      setIsBusy(false);
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
          {images.map((image, index) => {
            const imageId = imageIdFromPath(image);
            return (
              <li
                key={image}
                className="relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted"
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
                  {index !== 0 && imageId ? (
                    <button
                      type="button"
                      onClick={() => mutate("PATCH", imageId, "Copertina non aggiornata.")}
                      disabled={isBusy}
                      aria-label={`Usa la foto ${index + 1} come copertina`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/50 text-white transition-colors hover:bg-black/75 disabled:opacity-50"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {imageId ? (
                    <button
                      type="button"
                      onClick={() => mutate("DELETE", imageId, "Foto non rimossa.")}
                      disabled={isBusy}
                      aria-label={`Elimina la foto ${index + 1}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/50 text-white transition-colors hover:bg-status-blocked disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error ? <p className="mt-2 text-xs text-status-blocked">{error}</p> : null}
    </div>
  );
}
