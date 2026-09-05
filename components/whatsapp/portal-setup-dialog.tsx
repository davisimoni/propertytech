"use client";

import { useState } from "react";
import { Check, Clipboard, Mail, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Istruzioni per far arrivare i lead dei portali dentro la piattaforma.
 *
 * # La cosa che va detta prima di tutte
 *
 * Sui portali italiani non esiste un pulsante "aggiungi webhook" che l'agenzia
 * possa premere da sola. Su Immobiliare.it, Idealista e Casa.it l'inoltro
 * automatico dei lead lo attiva il portale, su richiesta, e i tempi non
 * dipendono da noi. Una guida che dice "vai in Impostazioni e incolla l'URL"
 * manda l'agente a cercare per venti minuti una voce che nel suo pannello non
 * c'e', e a concludere che il software e' rotto.
 *
 * Per questo l'inoltro email viene prima: e' l'unica strada che l'agenzia
 * percorre da sola, nella propria casella, senza chiedere niente a nessuno.
 *
 * # Perche' a schede e non un elenco unico
 *
 * Perche' un'agenzia lavora con uno o due portali, non con tutti. Un elenco
 * unico la costringe a leggere le istruzioni di Casa.it per trovare quelle di
 * Immobiliare.it, e in mezzo perde il passaggio che la riguarda.
 */

type PortaleId = "immobiliare" | "idealista-casa" | "gestionali";

const SCHEDE: { id: PortaleId; label: string }[] = [
  { id: "immobiliare", label: "Immobiliare.it" },
  { id: "idealista-casa", label: "Idealista / Casa.it" },
  { id: "gestionali", label: "Gestionali esterni" },
];

export function PortalSetupDialog({
  webhookUrl,
  inboundEmail,
  onClose,
}: {
  webhookUrl: string;
  /** `null` finche' non esiste un dominio di ricezione configurato. */
  inboundEmail: string | null;
  onClose: () => void;
}) {
  const [scheda, setScheda] = useState<PortaleId>("immobiliare");
  const [copiato, setCopiato] = useState<"email" | "webhook" | null>(null);

  async function copia(valore: string, quale: "email" | "webhook") {
    await navigator.clipboard.writeText(valore);
    setCopiato(quale);
    setTimeout(() => setCopiato(null), 2000);
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
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground sm:h-8 sm:w-8 transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* La premessa che evita la caccia al pulsante inesistente. */}
        <p className="mt-2 rounded-lg border border-status-pending/30 bg-status-pending/10 px-3 py-2.5 text-sm leading-relaxed text-foreground">
          I portali italiani <strong>non hanno un pulsante per aggiungere un webhook</strong> da
          soli: quell&apos;attivazione la fa il portale, su richiesta, con tempi suoi. La strada che
          dipende solo da te &egrave; l&apos;inoltro email, che configuri nella tua casella in
          cinque minuti.
        </p>

        {/* I due valori da incollare, in cima: servono mentre si legge il
            passaggio, non prima o dopo. */}
        <div className="mt-4 space-y-2">
          {inboundEmail && (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Indirizzo di inoltro
              </p>
              <code className="mt-1 block truncate text-xs text-foreground">{inboundEmail}</code>
              <button
                type="button"
                onClick={() => copia(inboundEmail, "email")}
                className="btn-outline mt-2 text-xs"
              >
                {copiato === "email" ? (
                  <Check className="h-3.5 w-3.5 text-status-qualified" />
                ) : (
                  <Mail className="h-3.5 w-3.5" />
                )}
                {copiato === "email" ? "Copiato!" : "Copia l'indirizzo"}
              </button>
            </div>
          )}

          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Link webhook
            </p>
            <code className="mt-1 block truncate text-xs text-foreground">{webhookUrl}</code>
            <button
              type="button"
              onClick={() => copia(webhookUrl, "webhook")}
              className="btn-outline mt-2 text-xs"
            >
              {copiato === "webhook" ? (
                <Check className="h-3.5 w-3.5 text-status-qualified" />
              ) : (
                <Clipboard className="h-3.5 w-3.5" />
              )}
              {copiato === "webhook" ? "Copiato!" : "Copia il link"}
            </button>
          </div>
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
                <span className="font-medium text-foreground">
                  Strada rapida &mdash; inoltro email.
                </span>{" "}
                Immobiliare.it ti manda ogni richiesta per email. Nella casella dell&apos;agenzia
                crea una regola di inoltro automatico verso l&apos;indirizzo qui sopra, filtrando
                sul mittente del portale. Da quel momento ogni richiesta entra da sola.
              </p>
              <p>
                <span className="font-medium text-foreground">
                  Strada strutturata &mdash; webhook.
                </span>{" "}
                Scrivi al tuo referente commerciale di Immobiliare.it e chiedi di impostare il link
                webhook come notifica lead in uscita. Non cercarlo nel pannello: sui contratti
                standard quella voce non &egrave; esposta all&apos;agenzia.
              </p>
            </>
          )}

          {scheda === "idealista-casa" && (
            <>
              <p>
                <span className="font-medium text-foreground">
                  Strada rapida &mdash; inoltro email.
                </span>{" "}
                Vale per entrambi: le richieste arrivano via email, e una regola di inoltro nella
                tua casella verso l&apos;indirizzo qui sopra &egrave; tutto quello che serve.
                &Egrave; anche l&apos;unica che puoi attivare oggi senza aspettare nessuno.
              </p>
              <p>
                <span className="font-medium text-foreground">
                  Strada strutturata &mdash; webhook.
                </span>{" "}
                Su Idealista e Casa.it l&apos;inoltro automatico si richiede all&apos;assistenza o
                al referente, allegando il link. Non &egrave; un ripiego: &egrave; come funziona il
                loro contratto.
              </p>
            </>
          )}

          {scheda === "gestionali" && (
            <>
              <p>
                Qui il webhook lo imposti tu. Incolla il link nella sezione{" "}
                <span className="font-medium text-foreground">
                  &laquo;Webhook notifiche in uscita&raquo;
                </span>{" "}
                del gestionale &mdash; la voce pu&ograve; chiamarsi anche &laquo;notifiche&raquo;,
                &laquo;integrazioni in uscita&raquo; o &laquo;callback&raquo;.
              </p>
              <p>
                Vale per Miogest, Gestim, Realigro e per qualunque gestionale che sappia inoltrare
                un lead via webhook. Se il tuo non lo fa, resta l&apos;inoltro email, che funziona
                lo stesso perch&eacute; parte dalla tua casella e non dal gestionale.
              </p>
            </>
          )}
        </div>

        <p className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Il link webhook contiene una chiave riservata: chi lo possiede pu&ograve; inserire lead
          nella tua pipeline. Consegnalo solo ai portali e al tuo gestionale.
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
