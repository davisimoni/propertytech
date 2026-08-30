"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie, X } from "lucide-react";

/**
 * Informativa cookie in basso a destra.
 *
 * # Perché è un avviso e non un consenso
 *
 * La piattaforma usa esclusivamente cookie tecnici e di sessione: sessione
 * autenticata, protezione CSRF, preferenza del tema. L&apos;art. 122 del Codice
 * Privacy non richiede consenso preventivo per questi, quindi qui non c&apos;è
 * nulla da autorizzare né da rifiutare.
 *
 * Da qui discendono due scelte che sembrano mancanze e non lo sono:
 *
 * - **Nessun pulsante "Rifiuta"**. Offrirlo significherebbe promettere che si
 *   può navigare senza cookie di sessione, cosa che renderebbe impossibile
 *   l&apos;accesso. Un rifiuto che non si può onorare è peggio di un rifiuto
 *   assente.
 * - **Nessun pannello "Gestisci preferenze"**. Non c&apos;è nessuna categoria
 *   facoltativa da attivare: sarebbe un pannello vuoto costruito per
 *   assomigliare a quelli dei siti che profilano.
 *
 * Il giorno in cui venisse introdotto anche un solo cookie di misurazione o di
 * profilazione, questo componente **non basta più**: servirebbe un consenso
 * preventivo, granulare e revocabile, e i cookie non potrebbero essere scritti
 * prima della scelta.
 *
 * # Perché non blocca la pagina
 *
 * Non c&apos;è una decisione da prendere prima di continuare, quindi non c&apos;è
 * ragione di interrompere la lettura. Il riquadro sta in un angolo, la pagina
 * resta interamente utilizzabile, e chi lo ignora non subisce alcuna
 * limitazione.
 */

const STORAGE_KEY = "cookie_consent_accepted";

/** Cinque secondi: il tempo di cominciare a leggere, prima dell'avviso. */
const DELAY_MS = 5_000;

/** Lettura difensiva: in navigazione privata `localStorage` può lanciare. */
function alreadyAccepted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // Storage non disponibile: si mostra l'avviso. Ripresentarlo è
    // preferibile a nasconderlo per un errore tecnico.
    return false;
  }
}

function remember(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // Il banner ricomparirà alla prossima visita. Nessun'altra conseguenza.
  }
}

/**
 * La parte visibile, separata dal contenitore che decide *quando* mostrarla.
 *
 * Non e' una separazione di stile: il contenitore dipende da un timer e da
 * `localStorage`, quindi non e' verificabile senza un browser, mentre questo
 * si rende e si controlla per intero. Le due responsabilita' — quando
 * comparire e cosa dire — non hanno motivo di stare insieme.
 */
export function CookieNotice({
  onAccept,
  onDismiss,
}: {
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      // `role="region"` e non `dialog`: non è modale e non cattura il fuoco.
      // Annunciarlo come finestra di dialogo direbbe a chi usa uno screen
      // reader che deve occuparsene prima di proseguire, il che non è vero.
      role="region"
      aria-label="Informativa sui cookie"
      className="animate-rise-in fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm"
    >
      <div className="rounded-xl border border-border bg-card p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Cookie className="h-4 w-4" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Cookie tecnici</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Questo sito utilizza cookie tecnici e necessari per garantire la migliore esperienza
              di navigazione e la sicurezza dei servizi. Per saperne di più, consulta la nostra{" "}
              <Link href="/cookie" className="font-medium text-primary hover:underline">
                Cookie Policy
              </Link>
              .
            </p>
          </div>

          {/* Chiusura senza memorizzare: chi la usa non ha preso una decisione,
              e il riquadro tornerà alla visita successiva. */}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Chiudi l'avviso"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onAccept}
          className="mt-3 h-11 w-full rounded-lg bg-brand-gradient text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 sm:h-10"
        >
          Accetta e chiudi
        </button>
      </div>
    </div>
  );
}

/**
 * Decide quando mostrare l'avviso: cinque secondi dopo l'arrivo, e mai piu'
 * a chi lo ha gia' accettato.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (alreadyAccepted()) return;

    const timer = setTimeout(() => setVisible(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <CookieNotice
      onAccept={() => {
        remember();
        setVisible(false);
      }}
      // Chiusura senza memorizzare: chi la usa non ha preso una decisione, e
      // il riquadro tornera' alla visita successiva.
      onDismiss={() => setVisible(false)}
    />
  );
}
