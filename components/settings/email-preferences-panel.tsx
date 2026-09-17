"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { ToggleSwitch } from "@/components/shared/toggle-switch";
import { useToast } from "@/components/shared/toast-provider";

/**
 * Preference center delle email.
 *
 * Un solo interruttore, la newsletter. Le email di servizio sono elencate ma
 * non disattivabili: dirlo qui evita che qualcuno cerchi come spegnerle, e
 * chiarisce che disiscriversi dalla newsletter non le tocca.
 */
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
          <Mail className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Preferenze email</p>

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

          <div className="mt-3 border-t border-border/70 pt-3">
            <p className="text-xs font-medium text-foreground">Comunicazioni di servizio</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Arrivano sempre, indipendentemente dalla newsletter: sessione WhatsApp disconnessa,
              crediti operativi all&apos;80% e al 100%, pubblicazioni social non riuscite, iscrizione,
              abbonamento e fatturazione, sicurezza dell&apos;account.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
