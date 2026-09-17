"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { ToggleSwitch } from "@/components/shared/toggle-switch";
import { useToast } from "@/components/shared/toast-provider";
import { usePushNotifications, type StatoPush } from "@/hooks/use-push-notifications";

/**
 * Preference center: newsletter e notifiche push di questo dispositivo.
 *
 * Le email di servizio sono elencate ma non disattivabili: dirlo qui evita
 * che qualcuno cerchi come spegnerle, e chiarisce che disiscriversi dalla
 * newsletter non le tocca.
 */

const SPIEGAZIONE_PUSH: Partial<Record<StatoPush, string>> = {
  bloccato:
    "Le notifiche sono bloccate per questo sito nelle impostazioni del browser. Sbloccale da lì, poi ricarica la pagina.",
  "ios-installa":
    "Su iPhone e iPad le notifiche funzionano con PropertyTech aggiunta alla schermata Home: in Safari tocca Condividi, poi Aggiungi alla schermata Home.",
  "non-supportato": "Questo browser non supporta le notifiche push.",
  "non-configurato": "Le notifiche push non sono ancora disponibili su questo ambiente.",
};

function RigaPush() {
  const { showToast } = useToast();
  const { stato, inCorso, attiva, disattiva } = usePushNotifications();
  const spiegazione = SPIEGAZIONE_PUSH[stato];

  const onChange = async (valore: boolean) => {
    const ok = valore ? await attiva() : await disattiva();
    if (ok) {
      showToast(valore ? "Notifiche attivate su questo dispositivo." : "Notifiche disattivate su questo dispositivo.", "success");
    } else if (valore) {
      showToast("Notifiche non attivate su questo dispositivo.", "info");
    }
  };

  return (
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
      <div className="min-w-0">
        <p className="text-sm text-foreground">Notifiche push su questo dispositivo</p>
        <p className="text-xs text-muted-foreground">
          {spiegazione ??
            "Lead qualificati, sessione WhatsApp disconnessa, crediti in esaurimento, pubblicazioni non riuscite."}
        </p>
      </div>
      {stato === "caricamento" ? (
        <span className="h-6 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
      ) : stato === "attivo" || stato === "disattivo" ? (
        <ToggleSwitch
          checked={stato === "attivo"}
          onChange={onChange}
          isSaving={inCorso}
          label="Notifiche push su questo dispositivo"
        />
      ) : null}
    </div>
  );
}

export function EmailPreferencesPanel() {
  const { showToast } = useToast();
  const [newsletter, setNewsletter] = useState<boolean | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);

  useEffect(() => {
    let attivo = true;
    fetch("/api/account/email-preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((dati: { newsletter: boolean } | null) => {
        if (attivo && dati) setNewsletter(dati.newsletter);
      })
      .catch(() => undefined);
    return () => {
      attivo = false;
    };
  }, []);

  async function aggiorna(valore: boolean) {
    const precedente = newsletter;
    setNewsletter(valore);
    setSalvataggio(true);
    try {
      const risposta = await fetch("/api/account/email-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsletter: valore }),
      });
      if (!risposta.ok) throw new Error();
      showToast(valore ? "Newsletter attivata." : "Newsletter disattivata.", "success");
    } catch {
      setNewsletter(precedente);
      showToast("Preferenza non salvata. Riprova.", "error");
    } finally {
      setSalvataggio(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bell className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Preferenze notifiche</p>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-foreground">Newsletter</p>
              <p className="text-xs text-muted-foreground">
                Martedì e giovedì: automazioni, casi operativi e conversione dei lead.
              </p>
            </div>
            {newsletter === null ? (
              <span className="h-6 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
            ) : (
              <ToggleSwitch
                checked={newsletter}
                onChange={aggiorna}
                isSaving={salvataggio}
                label="Ricevi la newsletter"
              />
            )}
          </div>

          <RigaPush />

          <div className="mt-3 border-t border-border/70 pt-3">
            <p className="text-xs font-medium text-foreground">Email di servizio</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Arrivano sempre, indipendentemente dalla newsletter: nuovo lead qualificato, sessione
              WhatsApp disconnessa, crediti operativi all&apos;80% e al 100%, pubblicazioni social non
              riuscite, iscrizione, abbonamento e fatturazione, sicurezza dell&apos;account.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
