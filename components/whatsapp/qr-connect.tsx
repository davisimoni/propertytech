"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, QrCode, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collegamento rapido: si inquadra un QR col telefono, come su WhatsApp Web.
 *
 * # Perché c'è un polling e non un evento
 *
 * Il microservizio avvisa la piattaforma con un webhook quando l'abbinamento
 * riesce, ma quel webhook arriva al *server*: il browser che sta mostrando il
 * QR non ne sa nulla. Il polling è il modo con cui questa scheda se ne
 * accorge. La rotta interrogata non si limita a rileggere il database —
 * chiede al microservizio — così l'agente vede il collegamento anche se il
 * webhook si perde per strada.
 *
 * # Perché il QR si rigenera da solo
 *
 * Il codice di WhatsApp scade in una ventina di secondi. Senza rigenerazione
 * l'agente che apre il modale, prende il telefono e sblocca lo schermo
 * troverebbe un codice già morto, e non avrebbe modo di capire perché la
 * scansione non funziona.
 */

const POLL_INTERVAL_MS = 3_000;
/** Sotto la soglia di scadenza del QR di WhatsApp, con un margine. */
const QR_REFRESH_MS = 20_000;

interface QrConnectProps {
  /** Richiamata a collegamento riuscito, per ricaricare la scheda. */
  onConnected: () => void;
}

export function QrConnect({ onConnected }: QrConnectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const requestQr = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/whatsapp/qr/generate", { method: "POST" });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setError(body?.message ?? "Non è stato possibile generare il codice. Riprova.");
        setQrDataUrl(null);
        return;
      }

      setQrDataUrl(body.qrDataUrl ?? null);
    } catch {
      setError("Errore di rete durante la generazione del codice.");
      setQrDataUrl(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  function open() {
    setIsOpen(true);
    requestQr();
  }

  function close() {
    setIsOpen(false);
    setQrDataUrl(null);
    setError(null);
  }

  // --- Polling dello stato mentre il modale è aperto ---
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const timer = setInterval(async () => {
      try {
        const response = await fetch("/api/whatsapp/qr/status");
        if (!response.ok) return;

        const body = await response.json();
        if (cancelled || body.status !== "connected") return;

        // Chiuso prima di avvisare il genitore: la scheda si ricarica e
        // mostra lo stato "Connesso" col numero, che è la conferma che
        // l'agente sta aspettando.
        close();
        onConnected();
      } catch {
        // Un giro di polling perso non è un errore da mostrare: il prossimo
        // riprova fra tre secondi.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isOpen, onConnected]);

  // --- Rigenerazione del QR prima che scada ---
  useEffect(() => {
    if (!isOpen || !qrDataUrl) return;

    const timer = setTimeout(requestQr, QR_REFRESH_MS);
    return () => clearTimeout(timer);
  }, [isOpen, qrDataUrl, requestQr]);

  // --- Chiusura con Escape ---
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) closeRef.current?.focus();
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient px-4 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 sm:w-auto"
      >
        <QrCode className="h-4 w-4" aria-hidden="true" />
        Connetti WhatsApp con QR Code
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-connect-title"
            onClick={(event) => event.stopPropagation()}
            className="relative w-full max-w-[90vw] rounded-xl border border-border bg-card p-5 shadow-lg sm:max-w-sm"
          >
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label="Chiudi"
              className="absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <h2 id="qr-connect-title" className="text-sm font-semibold text-foreground">
              Inquadra il codice con WhatsApp
            </h2>
            <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>1. Apri WhatsApp sul telefono dell&apos;agenzia</li>
              <li>2. Impostazioni → Dispositivi collegati → Collega dispositivo</li>
              <li>3. Inquadra il codice qui sotto</li>
            </ol>

            <div className="mt-4 flex aspect-square items-center justify-center rounded-xl border border-border bg-white p-3">
              {isLoading && !qrDataUrl ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : qrDataUrl ? (
                /* `<img>` e non `next/image`: la sorgente è un data URI
                   generato a ogni richiesta, quindi non c'è nulla da
                   ottimizzare né da mettere in cache, e il componente di Next
                   aggiungerebbe solo vincoli di configurazione. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="Codice QR per collegare WhatsApp"
                  className="h-full w-full object-contain"
                />
              ) : (
                <p className="px-4 text-center text-xs text-muted-foreground">
                  Codice non disponibile.
                </p>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-3 text-xs text-status-blocked">
                {error}
              </p>
            )}

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                In attesa della scansione…
              </p>
              <button
                type="button"
                onClick={requestQr}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                Nuovo codice
              </button>
            </div>

            <p className="mt-3 text-[11px] text-muted-foreground">
              Il codice si rinnova da solo ogni pochi secondi: se scade, aspetta il successivo.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
