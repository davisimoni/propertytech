"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, ImageUp, Loader2, Palette, Trash2 } from "lucide-react";

interface BrandingView {
  agencyName: string;
  legalName: string | null;
  logoDataUrl: string | null;
}

/** Deve restare sotto il limite accettato da /api/user/branding (400 KB di data URI). */
const MAX_LOGO_BYTES = 280 * 1024;

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function BrandingPanel() {
  const [branding, setBranding] = useState<BrandingView | null>(null);
  const [legalName, setLegalName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/user/branding")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: BrandingView | null) => {
        if (data) {
          setBranding(data);
          setLegalName(data.legalName ?? "");
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function persist(payload: Partial<BrandingView>) {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/user/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Salvataggio non riuscito.");
        return;
      }

      setBranding(body as BrandingView);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Errore di rete durante il salvataggio.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleLogoFile(file: File) {
    setError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Formato non supportato: usa PNG, JPG o WebP.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("Il logo supera i 280 KB. Comprimilo o riducine le dimensioni.");
      return;
    }

    // Convertito in data URI nel browser: il file non viene mai scritto su
    // disco, coerente con un deploy senza storage persistente.
    const reader = new FileReader();
    reader.onload = () => persist({ logoDataUrl: String(reader.result) });
    reader.onerror = () => setError("Impossibile leggere il file selezionato.");
    reader.readAsDataURL(file);
  }

  if (isLoading) {
    return (
      <section className="flex items-center justify-center rounded-xl border border-border bg-card p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Palette className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-foreground">Logo e intestazione documenti</h2>
          <p className="text-sm text-muted-foreground">
            Compaiono in cima ai PDF che consegni a proprietari e clienti.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <span className="text-xs font-medium text-muted-foreground">Logo dell&apos;agenzia</span>

          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-2">
              {branding?.logoDataUrl ? (
                <Image
                  src={branding.logoDataUrl}
                  alt={`Logo di ${branding.agencyName}`}
                  width={112}
                  height={64}
                  unoptimized
                  className="max-h-full w-auto object-contain"
                />
              ) : (
                <span className="text-center text-[10px] text-muted-foreground">
                  Nessun logo
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleLogoFile(file);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted disabled:opacity-50"
              >
                <ImageUp className="h-3.5 w-3.5" />
                {branding?.logoDataUrl ? "Sostituisci" : "Carica logo"}
              </button>

              {branding?.logoDataUrl && (
                <button
                  type="button"
                  onClick={() => persist({ logoDataUrl: null })}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-status-blocked disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Rimuovi
                </button>
              )}
            </div>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">PNG, JPG o WebP · massimo 280 KB</p>
        </div>

        <div>
          <label htmlFor="legal-name" className="text-xs font-medium text-muted-foreground">
            Ragione sociale
          </label>
          <input
            id="legal-name"
            type="text"
            value={legalName}
            onChange={(event) => setLegalName(event.target.value)}
            onBlur={() => {
              if (legalName.trim() !== (branding?.legalName ?? "")) {
                persist({ legalName: legalName.trim() });
              }
            }}
            placeholder="Immobiliare Rossi S.r.l."
            className="input-field mt-1"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Compare sotto il logo e nel piè di pagina dei documenti.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-status-blocked">
          {error}
        </p>
      )}

      {saved && !error && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-status-qualified">
          <Check className="h-4 w-4" />
          Salvato
        </p>
      )}
    </section>
  );
}
