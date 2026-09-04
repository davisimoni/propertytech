"use client";

import { useState } from "react";
import { Check, Clipboard, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Istruzioni per far arrivare i lead dei portali dentro la piattaforma.
 *
 * # Perché a schede e non un elenco unico
 *
 * Perché un'agenzia lavora con uno o due portali, non con tutti. Un elenco
 * unico la costringe a leggere le istruzioni di Casa.it per trovare quelle di
 * Immobiliare.it, e in mezzo perde il passaggio che la riguarda.
 *
 * # Perché il link si copia anche da qui
 *
 * Perché è il momento in cui serve. Chiudere la modale per copiare e riaprirla
 * per rileggere il passaggio successivo è il genere di andirivieni che fa
 * rimandare la configurazione a domani.
 */

type PortaleId = "immobiliare" | "idealista-casa" | "gestionali";

const SCHEDE: { id: PortaleId; label: string }[] = [
  { id: "immobiliare", label: "Immobiliare.it" },
  { id: "idealista-casa", label: "Idealista / Casa.it" },
  { id: "gestionali", label: "Gestionali esterni" },
];

export function PortalSetupDialog({
  webhookUrl,
  onClose,
}: {
  webhookUrl: string;
  onClose: () => void;
}) {
  const [scheda, setScheda] = useState<PortaleId>("immobiliare");
  const [copied, setCopied] = useState(false);

  async function copia() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Istruzioni di collegamento dei portali"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Istruzioni di collegamento</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 text-sm text-muted-foreground">
          Si consegna una volta sola. Da lì in poi ogni richiesta che arriva dal portale entra in
          pipeline e riceve il primo messaggio da sola.
        </p>

        {/* Il link in cima: e' cio' che va incollato, e serve mentre si legge
            il passaggio, non prima o dopo. */}
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
          <code className="block truncate text-xs text-foreground">{webhookUrl}</code>
          <button type="button" onClick={copia} className="btn-outline mt-2 text-xs">
            {copied ? (
              <Check className="h-3.5 w-3.5 text-status-qualified" />
            ) : (
              <Clipboard className="h-3.5 w-3.5" />
            )}
            {copied ? "Copiato!" : "Copia il link"}
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Portali"
          className="mt-4 flex flex-wrap gap-1 border-b border-border"
        >
          {SCHEDE.map((s) => (
            <button
              key={s.id}
              role="tab"
              type="button"
              aria-selected={scheda === s.id}
              onClick={() => setScheda(s.id)}
              className={cn(
                "border-b-2 px-3 py-2 text-xs font-medium transition-colors duration-200",
                scheda === s.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3 text-sm text-muted-foreground">
          {scheda === "immobiliare" && (
            <>
              <p>
                Vai in <span className="font-medium text-foreground">Area Riservata →
                Impostazioni → Integrazioni/Webhook</span> e incolla questo URL.
              </p>
              <p>
                Se quella voce non compare nel tuo pannello, invia il link al tuo{" "}
                <span className="font-medium text-foreground">referente commerciale di
                Immobiliare.it</span> chiedendo di impostarlo come webhook di notifica lead: su
                molti contratti l&apos;attivazione è lato loro.
              </p>
            </>
          )}

          {scheda === "idealista-casa" && (
            <>
              <p>
                Copia il link e invialo all&apos;
                <span className="font-medium text-foreground">assistenza o al referente del
                portale</span>, chiedendo di attivare l&apos;inoltro automatico dei lead via
                webhook a questo indirizzo.
              </p>
              <p>
                Su entrambi l&apos;inoltro si configura lato portale, non da un&apos;impostazione
                che trovi da solo nel pannello: la richiesta al referente è la strada, non un
                ripiego.
              </p>
            </>
          )}

          {scheda === "gestionali" && (
            <>
              <p>
                Incolla questo URL nella sezione{" "}
                <span className="font-medium text-foreground">
                  &laquo;Webhook Lead Outbound&raquo;
                </span>{" "}
                del tuo gestionale — la voce può chiamarsi anche &laquo;notifiche&raquo;,
                &laquo;integrazioni in uscita&raquo; o &laquo;callback&raquo;.
              </p>
              <p>
                Vale per Miogestionale, Agim, Realitweb e per qualunque altro gestionale che sappia
                inoltrare un lead via webhook. Se il tuo non lo fa, resta l&apos;inoltro via email
                dove disponibile, oppure il QR in vetrina.
              </p>
            </>
          )}
        </div>

        <p className="mt-4 rounded-lg border border-status-pending/30 bg-status-pending/10 px-3 py-2 text-xs leading-relaxed text-foreground">
          Il link contiene una chiave riservata: chi lo possiede può inserire lead nella tua
          pipeline. Consegnalo solo ai portali e al tuo gestionale.
        </p>

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="btn-outline text-xs">
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
