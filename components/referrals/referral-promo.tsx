"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Check, Clipboard, Gift, Loader2, X } from "lucide-react";
import {
  REFERRAL_DISCOUNT_PERCENT,
  REFERRAL_POPUP_DELAY_MS,
  REFERRAL_POPUP_INTERVAL_MS,
  REFERRAL_POPUP_OPEN_EVENT,
  REFERRAL_POPUP_STORAGE_KEY,
} from "@/lib/referrals/constants";

/**
 * Popup promozionale del Programma Referral.
 *
 * Compare da solo dopo `REFERRAL_POPUP_DELAY_MS` e non più di una volta ogni
 * quattro giorni, oppure su richiesta esplicita dal link nel footer.
 *
 * È **chiudibile in ogni modo** — X, Escape, clic fuori: è una promozione,
 * non il paywall. Il modale non chiudibile di CLAUDE.md §4 è riservato a chi
 * ha esaurito i crediti, non a chi sta semplicemente leggendo il sito.
 *
 * Montato dentro `LandingFooter` (quindi su landing, guida e pagine legali) e
 * nel layout dell'area riservata. Non sulle pagine di accesso e
 * registrazione: interrompere un modulo a metà compilazione è il modo più
 * rapido per far abbandonare l'iscrizione.
 */

/** Lettura difensiva: in navigazione privata `localStorage` può lanciare. */
function readLastSeen(): number | null {
  try {
    const raw = window.localStorage.getItem(REFERRAL_POPUP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeLastSeen(): void {
  try {
    window.localStorage.setItem(REFERRAL_POPUP_STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage non disponibile: il popup ricomparirà alla visita successiva.
    // Meglio di un errore in pagina per una funzione promozionale.
  }
}

export function ReferralPromo() {
  const { status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [isLoadingLink, setIsLoadingLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const isAuthenticated = status === "authenticated";

  const close = useCallback(() => {
    setIsOpen(false);
    writeLastSeen();
  }, []);

  // --- Apertura automatica, non più di una volta ogni REFERRAL_POPUP_INTERVAL_MS ---
  useEffect(() => {
    // Si aspetta di sapere se c'è una sessione: aprire durante il "loading"
    // mostrerebbe l'invito a registrarsi a chi è già dentro.
    if (status === "loading") return;

    const lastSeen = readLastSeen();
    if (lastSeen !== null && Date.now() - lastSeen < REFERRAL_POPUP_INTERVAL_MS) return;

    const timer = setTimeout(() => {
      setIsOpen(true);
      // Scritto all'apparizione e non solo alla chiusura: se la scheda viene
      // abbandonata col popup aperto, la prossima visita non deve riproporlo.
      writeLastSeen();
    }, REFERRAL_POPUP_DELAY_MS);

    return () => clearTimeout(timer);
  }, [status]);

  // --- Apertura su richiesta dal link nel footer ---
  useEffect(() => {
    // L'apertura manuale ignora la finestra dei quattro giorni: l'ha chiesta
    // l'utente, non è un'interruzione.
    function handleOpenRequest() {
      setIsOpen(true);
    }

    window.addEventListener(REFERRAL_POPUP_OPEN_EVENT, handleOpenRequest);
    return () => window.removeEventListener(REFERRAL_POPUP_OPEN_EVENT, handleOpenRequest);
  }, []);

  // --- Chiusura con Escape ---
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen) closeRef.current?.focus();
  }, [isOpen]);

  // --- Link personale, solo per chi ha una sessione ---
  useEffect(() => {
    if (!isOpen || !isAuthenticated || referralLink) return;

    let cancelled = false;
    setIsLoadingLink(true);

    fetch("/api/referrals")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { referralLink?: string } | null) => {
        if (!cancelled && data?.referralLink) setReferralLink(data.referralLink);
      })
      .catch(() => {
        // Nessun link mostrato: resta il pulsante verso le impostazioni.
      })
      .finally(() => {
        if (!cancelled) setIsLoadingLink(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, isAuthenticated, referralLink]);

  async function copyLink() {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Appunti negati dal browser: il link resta visibile e selezionabile.
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="referral-promo-title"
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-lg"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={close}
          aria-label="Chiudi"
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/15 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="bg-brand-gradient px-6 pb-6 pt-7 text-white">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
            <Gift className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 id="referral-promo-title" className="mt-3 text-lg font-semibold">
            Invita un&apos;agenzia, risparmiate entrambe il {REFERRAL_DISCOUNT_PERCENT}% per sempre
          </h2>
          <p className="mt-1 text-sm text-white/90">
            Conosci un collega che perde ore dietro ai lead? Presentagli PropertyTech: stesso
            sconto, ricorrente per sempre, per entrambe le agenzie.
          </p>
        </div>

        <div className="p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Per te</p>
              <p className="mt-1 text-sm text-foreground">
                <span className="font-semibold">-{REFERRAL_DISCOUNT_PERCENT}% ricorrente per sempre</span>{" "}
                sul tuo abbonamento, appena l&apos;agenzia che inviti attiva un piano a pagamento.
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Per l&apos;agenzia invitata
              </p>
              <p className="mt-1 text-sm text-foreground">
                Inizia con la <span className="font-semibold">prova gratuita</span>, poi lo stesso{" "}
                <span className="font-semibold">-{REFERRAL_DISCOUNT_PERCENT}% per sempre</span> sul
                suo abbonamento, dal primo pagamento.
              </p>
            </div>
          </div>

          {isAuthenticated ? (
            <div className="mt-5">
              <p className="text-xs font-medium text-muted-foreground">Il tuo link di invito</p>

              {isLoadingLink ? (
                <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Caricamento…</span>
                </div>
              ) : referralLink ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-foreground">
                    {referralLink}
                  </code>
                  <button
                    type="button"
                    onClick={copyLink}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand-gradient px-3 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:brightness-110"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {copied ? "Copiato" : "Copia Link"}
                  </button>
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Trovi il tuo link nelle impostazioni.
                </p>
              )}

              <Link
                href="/settings#referral"
                onClick={close}
                className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
              >
                Vedi le agenzie invitate e lo stato del tuo sconto
              </Link>
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-2">
              <Link
                href="/register"
                onClick={close}
                className="inline-flex w-full items-center justify-center rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110"
              >
                Crea un account gratuito e inizia a invitare
              </Link>
              <Link
                href="/login"
                onClick={close}
                className="inline-flex w-full items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-all duration-200 hover:bg-muted"
              >
                Ho già un account, accedi
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
