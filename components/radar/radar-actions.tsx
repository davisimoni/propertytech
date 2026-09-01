"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Loader2, Pencil, Trash2 } from "lucide-react";
import { PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";
import type { PropertyType } from "@prisma/client";
import type { RadarItem } from "./radar-board";

/**
 * Modifica, archiviazione ed eliminazione di un lotto.
 *
 * # Perché archiviare non è eliminare
 *
 * Un'asta aggiudicata da qualcun altro esce dall'elenco ma resta a database:
 * portarsela via cancellerebbe anche gli abbinamenti già mostrati e la storia
 * di cosa è stato proposto a chi — che è proprio ciò che serve rileggere fra
 * sei mesi, quando quel cliente ritorna. L'eliminazione resta per gli errori
 * di inserimento, ed è l'unica delle tre che chiede conferma.
 *
 * # Perché la modifica ricalcola da sola
 *
 * Comune, zona, tipologia, prezzo e metratura sono i cinque criteri del
 * punteggio: cambiarne uno e lasciare gli abbinamenti vecchi mostrerebbe in
 * scheda accostamenti che i dati attuali non giustificano più. Il ricalcolo lo
 * fa la rotta, senza un secondo tasto da premere.
 */

const numero = (v: string): number | null => {
  const pulito = v.replace(/[.\s€]/g, "").trim();
  if (!pulito) return null;
  const n = Number(pulito);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export function RadarActions({
  item,
  onChanged,
  onDeleted,
}: {
  item: RadarItem;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [modifica, setModifica] = useState(false);
  const [conferma, setConferma] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>, messaggio?: string) {
    setInCorso(true);
    setError(null);
    setAvviso(null);
    try {
      const response = await fetch(`/api/radar/properties/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const dati = await response.json().catch(() => null);
      if (!response.ok) {
        setError(dati?.message ?? `Operazione non riuscita (errore ${response.status}).`);
        return false;
      }

      if (dati?.priceDropPct) {
        setAvviso(
          `Ribasso del ${dati.priceDropPct}% registrato${
            dati.nuoviAbbinamenti > 0
              ? `: ${dati.nuoviAbbinamenti} ${dati.nuoviAbbinamenti === 1 ? "nuovo lead rientra" : "nuovi lead rientrano"} nel budget.`
              : "."
          }`
        );
      } else if (messaggio) {
        setAvviso(messaggio);
      }

      onChanged();
      return true;
    } catch {
      setError("Errore di rete.");
      return false;
    } finally {
      setInCorso(false);
    }
  }

  async function elimina() {
    setInCorso(true);
    try {
      const response = await fetch(`/api/radar/properties/${item.id}?confirm=true`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError("Eliminazione non riuscita.");
        return;
      }
      setConferma(false);
      onDeleted();
    } catch {
      setError("Errore di rete.");
    } finally {
      setInCorso(false);
    }
  }

  async function salvaModifiche(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const v = (n: string) => String(form.get(n) ?? "").trim();
    const data = v("auctionDate");

    const fatto = await patch(
      {
        comune: v("comune"),
        zona: v("zona") || null,
        type: v("type"),
        squareMeters: numero(v("squareMeters")),
        priceEur: numero(v("priceEur")),
        basePriceEur: numero(v("basePriceEur")),
        auctionDate: data ? new Date(`${data}T12:00:00`).toISOString() : null,
        lotto: v("lotto") || null,
        notes: v("notes") || null,
      },
      "Modifiche salvate."
    );
    if (fatto) setModifica(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setModifica((m) => !m)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
        >
          <Pencil className="h-3.5 w-3.5" />
          {modifica ? "Chiudi modifica" : "Modifica dati"}
        </button>

        <button
          type="button"
          disabled={inCorso}
          onClick={() =>
            patch(
              { archived: item.archivedAt === null },
              item.archivedAt === null
                ? "Opportunità archiviata: non compare più in elenco."
                : "Opportunità ripristinata in elenco."
            )
          }
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted disabled:opacity-50"
        >
          {item.archivedAt === null ? (
            <>
              <Archive className="h-3.5 w-3.5" />
              Archivia / aggiudicata
            </>
          ) : (
            <>
              <ArchiveRestore className="h-3.5 w-3.5" />
              Ripristina
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setConferma(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-status-blocked transition-all duration-200 hover:border-status-blocked/40 hover:bg-status-blocked/5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Elimina
        </button>

        {inCorso && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {avviso && <p className="text-xs text-status-qualified">{avviso}</p>}
      {error && (
        <p role="alert" className="text-xs text-status-blocked">
          {error}
        </p>
      )}

      {modifica && (
        <form onSubmit={salvaModifiche} className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id={`m-comune-${item.id}`} label="Comune">
              <input id={`m-comune-${item.id}`} name="comune" defaultValue={item.comune} required maxLength={120} className="input-field h-9 w-full text-base sm:text-sm" />
            </Campo>
            <Campo id={`m-zona-${item.id}`} label="Zona">
              <input id={`m-zona-${item.id}`} name="zona" defaultValue={item.zona ?? ""} maxLength={120} className="input-field h-9 w-full text-base sm:text-sm" />
            </Campo>
            <Campo id={`m-type-${item.id}`} label="Tipologia">
              <select id={`m-type-${item.id}`} name="type" defaultValue={item.type} className="input-field h-9 w-full text-base sm:text-sm">
                {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((t) => (
                  <option key={t} value={t}>
                    {PROPERTY_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id={`m-mq-${item.id}`} label="Metri quadri">
              <input id={`m-mq-${item.id}`} name="squareMeters" defaultValue={item.squareMeters} inputMode="numeric" className="input-field h-9 w-full text-base sm:text-sm" />
            </Campo>
            <Campo
              id={`m-prezzo-${item.id}`}
              label={item.kind === "ASTA" ? "Offerta minima (€)" : "Prezzo attuale (€)"}
              hint="abbassandolo si registra il ribasso"
            >
              <input id={`m-prezzo-${item.id}`} name="priceEur" defaultValue={item.priceEur} inputMode="numeric" className="input-field h-9 w-full text-base sm:text-sm" />
            </Campo>
            <Campo id={`m-base-${item.id}`} label="Valore di perizia (€)">
              <input id={`m-base-${item.id}`} name="basePriceEur" defaultValue={item.basePriceEur ?? ""} inputMode="numeric" className="input-field h-9 w-full text-base sm:text-sm" />
            </Campo>
            {item.kind === "ASTA" && (
              <>
                <Campo id={`m-data-${item.id}`} label="Data dell'asta">
                  <input id={`m-data-${item.id}`} name="auctionDate" type="date" defaultValue={item.auctionDate ? item.auctionDate.slice(0, 10) : ""} className="input-field h-9 w-full text-base sm:text-sm" />
                </Campo>
                <Campo id={`m-lotto-${item.id}`} label="Lotto">
                  <input id={`m-lotto-${item.id}`} name="lotto" defaultValue={item.lotto ?? ""} maxLength={60} className="input-field h-9 w-full text-base sm:text-sm" />
                </Campo>
              </>
            )}
          </div>

          <Campo id={`m-note-${item.id}`} label="Note">
            <textarea id={`m-note-${item.id}`} name="notes" defaultValue={item.notes ?? ""} rows={2} maxLength={2000} className="input-field w-full resize-y text-base sm:text-sm" />
          </Campo>

          <p className="mt-2 text-xs text-muted-foreground">
            Cambiando comune o zona le coordinate vengono ricalcolate, e gli abbinamenti con i lead
            si aggiornano da soli.
          </p>

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setModifica(false)} className="h-9 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted">
              Annulla
            </button>
            <button type="submit" disabled={inCorso} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-gradient px-3 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50">
              {inCorso && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salva modifiche
            </button>
          </div>
        </form>
      )}

      {conferma && (
        <div role="dialog" aria-modal="true" aria-label="Conferma eliminazione" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-lg">
            <h4 className="text-sm font-semibold text-foreground">
              Eliminare questa opportunità?
            </h4>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Vengono cancellati anche la sintesi della perizia e gli abbinamenti con i lead.
              L&apos;operazione non è reversibile.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Se l&apos;asta si è semplicemente conclusa, conviene <strong>archiviarla</strong>:
              esce dall&apos;elenco ma resta consultabile, con la storia di cosa è stato proposto a
              chi.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              {/* Il fuoco iniziale sta su Annulla: il primo tasto raggiunto da
                  tastiera non deve essere quello che cancella. */}
              <button
                type="button"
                autoFocus
                onClick={() => setConferma(false)}
                className="h-9 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors duration-200 hover:bg-muted"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={elimina}
                disabled={inCorso}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-status-blocked px-3 text-xs font-medium text-white transition-all duration-200 hover:brightness-110 disabled:opacity-50"
              >
                {inCorso && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Elimina definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2 first:mt-0">
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
        {hint && <span className="font-normal text-muted-foreground"> ({hint})</span>}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
