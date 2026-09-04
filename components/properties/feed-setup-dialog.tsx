"use client";

import { useState } from "react";
import { Check, Clipboard, Mail, X } from "lucide-react";

/**
 * Istruzioni per configurare il feed sui portali.
 *
 * # Perché non ci sono percorsi di menu esatti
 *
 * Perché quel menu non esiste. Su Immobiliare.it, Idealista e Casa.it l'URL
 * del feed lo registra il portale nei propri sistemi centrali, su richiesta
 * dell'agenzia: non c'è un pannello self-service dove incollarlo. Scrivere
 * "Impostazioni → Feed → Aggiungi sorgente" manda l'agente a cercare una voce
 * che nel suo pannello non c'è, e quando non la trova conclude che il nostro
 * feed non funziona.
 *
 * È la stessa regola dei connettori gestionale non verificati: un'istruzione
 * che sembra precisa e non lo è costa più di un'istruzione che dichiara i
 * propri limiti.
 *
 * # Perché l'email già scritta
 *
 * Perché è il punto in cui la configurazione si ferma davvero. L'agente sa
 * cosa deve ottenere ma non come chiederlo, e una richiesta vaga
 * all'assistenza torna indietro con una domanda invece che con
 * un'attivazione. Il testo pronto nomina la cosa esatta da fare — registrare
 * l'URL come feed di importazione automatica — e cita l'indirizzo, così il
 * primo giro di email è già quello giusto.
 */

/** Testo pronto da incollare nell'email all'assistenza del portale. */
function emailTipo(feedUrl: string): string {
  return [
    "Oggetto: Attivazione importazione automatica annunci (Feed XML)",
    "",
    "Gentile Assistenza,",
    "",
    "vi chiedo di collegare il seguente Feed XML per l'aggiornamento automatico dei miei annunci:",
    "",
    feedUrl,
    "",
    "Vi chiedo cortesemente di impostarlo come URL Feed XML di importazione automatica, con lettura giornaliera, e di confermarmi l'avvenuta attivazione.",
    "",
    "Cordiali saluti,",
  ].join("\n");
}

export function FeedSetupDialog({
  feedUrl,
  onClose,
}: {
  feedUrl: string;
  onClose: () => void;
}) {
  const [copiato, setCopiato] = useState<"url" | "email" | null>(null);

  async function copia(valore: string, quale: "url" | "email") {
    await navigator.clipboard.writeText(valore);
    setCopiato(quale);
    setTimeout(() => setCopiato(null), 2000);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Come configurare il feed XML"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Come configurare il feed</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          Si consegna una volta sola. Da lì in poi il portale rilegge il portafoglio da solo, di
          norma una o due volte al giorno.
        </p>

        {/* L'indirizzo e i due comandi in cima: servono mentre si legge il
            passaggio. Il pulsante di copia stava fuori dalla modale, che nel
            frattempo lo copriva, e il testo diceva "qui accanto". */}
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Indirizzo del feed
          </p>
          <code className="mt-1 block truncate text-xs text-foreground">{feedUrl}</code>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => copia(feedUrl, "url")}
              className="btn-outline text-xs"
            >
              {copiato === "url" ? (
                <Check className="h-3.5 w-3.5 text-status-qualified" />
              ) : (
                <Clipboard className="h-3.5 w-3.5" />
              )}
              {copiato === "url" ? "Copiato!" : "Copia il link"}
            </button>
            <button
              type="button"
              onClick={() => copia(emailTipo(feedUrl), "email")}
              className="btn-outline text-xs"
            >
              {copiato === "email" ? (
                <Check className="h-3.5 w-3.5 text-status-qualified" />
              ) : (
                <Mail className="h-3.5 w-3.5" />
              )}
              {copiato === "email" ? "Copiata!" : "Copia email tipo per l'assistenza portale"}
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-foreground">
              Immobiliare.it, Idealista e Casa.it
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Copia il link qui sopra e invialo via email al tuo account manager o al supporto
              tecnico del portale, chiedendo di impostarlo come{" "}
              <span className="font-medium text-foreground">
                &laquo;URL Feed XML di importazione automatica&raquo;
              </span>
              . Il pulsante &laquo;Copia email tipo&raquo; scrive per te la richiesta, con
              l&apos;indirizzo già dentro.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Non cercare la voce nel pannello: su tutti e tre l&apos;importazione da feed si
              abilita sul contratto dell&apos;agenzia, non da un&apos;impostazione che trovi da
              solo.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold text-foreground">Gestionali esterni</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Qui lo imposti tu: incolla il link nella sezione{" "}
              <span className="font-medium text-foreground">
                &laquo;Importazione Feed XML / Sorgente Esterna&raquo;
              </span>{" "}
              del tuo gestionale principale. Il tracciato è quello standard degli annunci
              immobiliari.
            </p>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Alla prima lettura compaiono gli immobili marcati{" "}
          <span className="font-medium text-foreground">In vendita</span>. Le bozze restano fuori.
        </p>

        <p className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Prima di consegnarlo:</span> fai validare
          il tracciato dal referente del portale. Ogni portale ha le sue regole sui campi
          obbligatori, e scoprirlo al primo caricamento massivo costa più che chiederlo prima.
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
