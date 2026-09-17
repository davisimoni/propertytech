"use client";

import { useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useToast } from "@/components/shared/toast-provider";

const CHIAVE_RIMANDO = "pt-push-banner-rimandato";
/** Dopo "Non ora" il banner torna fra due settimane, non al prossimo caricamento. */
const RIMANDO_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Invito sobrio ad attivare le notifiche su questo dispositivo.
 *
 * # Perché un banner e non la richiesta del browser all'apertura
 *
 * Perché il permesso si chiede una volta sola: se l'utente lo nega d'istinto,
 * davanti a un popup che non ha chiesto, il browser non consente più di
 * riproporlo. Il banner spiega prima a cosa servono le notifiche e chiede il
 * permesso solo al clic.
 *
 * Compare solo quando c'è qualcosa da fare (`disattivo`). Non compare se le
 * notifiche sono già attive, bloccate o non supportate: in quei casi le
 * indicazioni stanno in Impostazioni.
 */
export function PushPermissionBanner() {
  const { stato, inCorso, attiva } = usePushNotifications();
  const { showToast } = useToast();
  const [rimandato, setRimandato] = useState(true);

  useEffect(() => {
    try {
      const quando = Number(window.localStorage.getItem(CHIAVE_RIMANDO) ?? 0);
      setRimandato(Date.now() - quando < RIMANDO_MS);
    } catch {
      setRimandato(false);
    }
  }, []);

  if (stato !== "disattivo" || rimandato) return null;

  const rimanda = () => {
    setRimandato(true);
    try {
      window.localStorage.setItem(CHIAVE_RIMANDO, String(Date.now()));
    } catch {
      // Senza storage il banner tornerà al prossimo caricamento: accettabile.
    }
  };

  const onAttiva = async () => {
    const ok = await attiva();
    showToast(
      ok
        ? "Notifiche attivate su questo dispositivo."
        : "Notifiche non attivate. Puoi riprovare da Impostazioni, Privacy e Normativa.",
      ok ? "success" : "info"
    );
  };

  return (
    <section
      aria-label="Notifiche su questo dispositivo"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BellRing className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Notifiche su questo dispositivo</p>
          <p className="text-sm text-muted-foreground">
            Avviso immediato per nuovi lead qualificati, sessione WhatsApp disconnessa, crediti in
            esaurimento e pubblicazioni non riuscite.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:justify-end">
        <button
          type="button"
          onClick={rimanda}
          className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Non ora
        </button>
        <button type="button" onClick={onAttiva} disabled={inCorso} className="btn-brand text-sm">
          {inCorso && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Attiva notifiche
        </button>
      </div>
    </section>
  );
}
