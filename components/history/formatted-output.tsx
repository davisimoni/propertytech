"use client";

import { Fragment, type ReactNode } from "react";
import { humanizeKey } from "@/lib/history/output-text";

/**
 * Rende leggibile a schermo il risultato di un'elaborazione.
 *
 * # Due forme, due trattamenti
 *
 * L'estrazione documentale produce un **oggetto strutturato** (dati catastali,
 * proprietari, criticità); il report post-visita e i testi social producono
 * **prosa**. Appiattire il primo in una colonna di testo o incolonnare il
 * secondo darebbe in entrambi i casi qualcosa di peggio dell'originale, quindi
 * qui si distinguono: sezioni ed etichette per l'oggetto, formattazione
 * tipografica per il testo.
 *
 * # Perché il markdown è fatto in casa
 *
 * Serve un sottoinsieme minuscolo — titoli, grassetto, elenchi, paragrafi — e
 * i modelli non producono altro in questi output. Una libreria completa
 * porterebbe con sé la capacità di emettere HTML grezzo, che su testo generato
 * da un modello a partire da un documento caricato da un utente è una
 * superficie che non ho motivo di aprire. Qui non si costruisce mai HTML: si
 * restituiscono elementi React, e quello che non è riconosciuto resta testo.
 */

/** Grassetto in linea. Il resto della riga passa invariato. */
function renderInline(text: string): ReactNode {
  const parti = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);

  return parti.map((parte, i) =>
    parte.startsWith("**") && parte.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">
        {parte.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{parte}</Fragment>
    )
  );
}

function MarkdownLite({ text }: { text: string }) {
  const righe = text.split(/\r?\n/);
  const blocchi: ReactNode[] = [];

  let elenco: string[] = [];
  let elencoNumerato = false;

  function chiudiElenco(chiave: number) {
    if (elenco.length === 0) return;
    const voci = elenco;
    const numerato = elencoNumerato;
    elenco = [];

    blocchi.push(
      numerato ? (
        <ol key={`l${chiave}`} className="ml-5 list-decimal space-y-1 text-sm text-muted-foreground">
          {voci.map((voce, i) => (
            <li key={i}>{renderInline(voce)}</li>
          ))}
        </ol>
      ) : (
        <ul key={`l${chiave}`} className="ml-5 list-disc space-y-1 text-sm text-muted-foreground">
          {voci.map((voce, i) => (
            <li key={i}>{renderInline(voce)}</li>
          ))}
        </ul>
      )
    );
  }

  righe.forEach((riga, indice) => {
    const pulita = riga.trim();

    const titolo = pulita.match(/^(#{1,3})\s+(.*)$/);
    if (titolo) {
      chiudiElenco(indice);
      const livello = (titolo[1] ?? "").length;
      blocchi.push(
        <p
          key={indice}
          className={
            livello === 1
              ? "text-sm font-semibold text-foreground"
              : livello === 2
                ? "text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                : "text-xs font-medium text-foreground"
          }
        >
          {renderInline(titolo[2] ?? "")}
        </p>
      );
      return;
    }

    const puntato = pulita.match(/^[-*]\s+(.*)$/);
    if (puntato) {
      if (elencoNumerato) chiudiElenco(indice);
      elencoNumerato = false;
      elenco.push(puntato[1] ?? "");
      return;
    }

    const numerato = pulita.match(/^\d+[.)]\s+(.*)$/);
    if (numerato) {
      if (!elencoNumerato) chiudiElenco(indice);
      elencoNumerato = true;
      elenco.push(numerato[1] ?? "");
      return;
    }

    chiudiElenco(indice);

    if (!pulita) return;

    blocchi.push(
      <p key={indice} className="text-sm leading-relaxed text-muted-foreground">
        {renderInline(pulita)}
      </p>
    );
  });

  chiudiElenco(righe.length);

  return <div className="space-y-3">{blocchi}</div>;
}

/** Valore semplice: `null` e stringhe vuote diventano un trattino, non spariscono. */
function Valore({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-foreground">{value ? "Sì" : "No"}</span>;
  }
  return <span className="text-foreground">{String(value)}</span>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rende un oggetto strutturato come sezioni ed etichette.
 *
 * I campi vuoti restano visibili con un trattino invece di sparire: su una
 * visura, "Rendita catastale: —" dice che il dato non è stato estratto, mentre
 * la riga assente lascia credere che nessuno l'abbia cercato.
 */
function Strutturato({ value, livello = 0 }: { value: unknown; livello?: number }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="text-sm text-muted-foreground">Nessuna voce.</p>;

    return (
      <div className="space-y-2">
        {value.map((voce, i) =>
          isPlainObject(voce) || Array.isArray(voce) ? (
            <div key={i} className="rounded-lg border border-border p-3">
              <Strutturato value={voce} livello={livello + 1} />
            </div>
          ) : (
            <p key={i} className="text-sm text-foreground">
              • {String(voce)}
            </p>
          )
        )}
      </div>
    );
  }

  if (!isPlainObject(value)) {
    return (
      <p className="text-sm">
        <Valore value={value} />
      </p>
    );
  }

  const voci = Object.entries(value);
  if (voci.length === 0) return <p className="text-sm text-muted-foreground">Nessun dato.</p>;

  return (
    <div className={livello === 0 ? "space-y-4" : "space-y-2"}>
      {voci.map(([chiave, valore]) => {
        const composto = isPlainObject(valore) || Array.isArray(valore);

        if (composto) {
          return (
            <section key={chiave}>
              <h4
                className={
                  livello === 0
                    ? "text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    : "text-xs font-medium text-foreground"
                }
              >
                {humanizeKey(chiave)}
              </h4>
              <div className="mt-2">
                <Strutturato value={valore} livello={livello + 1} />
              </div>
            </section>
          );
        }

        return (
          <div
            key={chiave}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border py-1.5 last:border-b-0"
          >
            <span className="text-xs text-muted-foreground">{humanizeKey(chiave)}</span>
            <span className="text-sm font-medium">
              <Valore value={valore} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function FormattedOutput({ output }: { output: unknown }) {
  if (typeof output === "string") {
    return output.trim() ? (
      <MarkdownLite text={output} />
    ) : (
      <p className="text-sm text-muted-foreground">Questa elaborazione non ha prodotto testo.</p>
    );
  }

  return <Strutturato value={output} />;
}
