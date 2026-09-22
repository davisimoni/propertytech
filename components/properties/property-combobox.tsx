"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, Link2Off, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sceglie un immobile del portafoglio, oppure accetta un riferimento scritto
 * a mano.
 *
 * # Perché non una `<select>`
 *
 * Perché un'agenzia con duecento immobili in un menu a tendina cerca scorrendo,
 * e sul telefono scorre una lista modale lunga quanto il portafoglio. Qui si
 * scrive e l'elenco si restringe, che è come un agente cerca davvero: ricorda
 * "quello di via Roma", non la posizione nell'elenco.
 *
 * # Perché il campo resta di testo libero
 *
 * Perché il caso più frequente di questa checklist è l'immobile che **non è
 * ancora** a portafoglio: la si compila durante il primo appuntamento, prima
 * dell'incarico. Un selettore che accetta solo schede esistenti escluderebbe
 * proprio il momento in cui serve di più.
 *
 * Il collegamento a una scheda è quindi esplicito e visibile: finché c'è, la
 * checklist si salva su quell'immobile; appena si riscrive il testo a mano il
 * collegamento si stacca, e lo si vede.
 */

export interface ImmobileInPortafoglio {
  id: string;
  reference: string;
  title: string;
  comune: string;
  indirizzo: string | null;
}

interface PropertyComboboxProps {
  /** Testo mostrato: riferimento scelto o scritto a mano. */
  valore: string;
  onValoreChange: (valore: string) => void;
  /** Id della scheda collegata, `null` quando è testo libero. */
  immobileId: string | null;
  onImmobileChange: (immobile: ImmobileInPortafoglio | null) => void;
  label?: string;
  descrizione?: string;
}

/** Come si legge un immobile in elenco: riferimento, titolo, dove si trova. */
function etichetta(immobile: ImmobileInPortafoglio): string {
  const dove = immobile.indirizzo
    ? `${immobile.indirizzo}, ${immobile.comune}`
    : immobile.comune;
  return `${immobile.reference} · ${immobile.title} · ${dove}`;
}

export function PropertyCombobox({
  valore,
  onValoreChange,
  immobileId,
  onImmobileChange,
  label = "Immobile in verifica",
  descrizione,
}: PropertyComboboxProps) {
  const [immobili, setImmobili] = useState<ImmobileInPortafoglio[] | null>(null);
  const [aperto, setAperto] = useState(false);
  const [evidenziato, setEvidenziato] = useState(0);
  const contenitore = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/properties")
      .then((r) => (r.ok ? r.json() : null))
      // Silenzio in caso di errore: il campo resta di testo libero, che è
      // comunque un modo completo di usare la checklist. Un errore rosso qui
      // bloccherebbe una pagina che funziona.
      .then((dati) => setImmobili((dati?.properties ?? []) as ImmobileInPortafoglio[]))
      .catch(() => setImmobili([]));
  }, []);

  // Chiusura al clic fuori: senza, l'elenco resta aperto sopra la checklist.
  useEffect(() => {
    if (!aperto) return;

    function suClic(evento: MouseEvent) {
      if (!contenitore.current?.contains(evento.target as Node)) setAperto(false);
    }

    document.addEventListener("mousedown", suClic);
    return () => document.removeEventListener("mousedown", suClic);
  }, [aperto]);

  const filtrati = useMemo(() => {
    const elenco = immobili ?? [];
    const cerca = valore.trim().toLowerCase();
    if (!cerca) return elenco.slice(0, 8);

    return elenco
      .filter((immobile) => etichetta(immobile).toLowerCase().includes(cerca))
      .slice(0, 8);
  }, [immobili, valore]);

  const collegato = immobili?.find((immobile) => immobile.id === immobileId) ?? null;

  function scegli(immobile: ImmobileInPortafoglio) {
    onValoreChange(`${immobile.reference} · ${immobile.title}`);
    onImmobileChange(immobile);
    setAperto(false);
  }

  function suTastiera(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "Escape") {
      setAperto(false);
      return;
    }

    if (!aperto && (evento.key === "ArrowDown" || evento.key === "ArrowUp")) {
      setAperto(true);
      return;
    }

    if (!aperto || filtrati.length === 0) return;

    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setEvidenziato((attuale) => (attuale + 1) % filtrati.length);
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setEvidenziato((attuale) => (attuale - 1 + filtrati.length) % filtrati.length);
    } else if (evento.key === "Enter") {
      const scelto = filtrati[evidenziato];
      if (scelto) {
        evento.preventDefault();
        scegli(scelto);
      }
    }
  }

  return (
    <div ref={contenitore} className="relative">
      <label htmlFor="audit-immobile" className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {descrizione && <p className="mt-0.5 text-xs text-muted-foreground">{descrizione}</p>}

      <div className="relative mt-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="audit-immobile"
          type="text"
          role="combobox"
          aria-expanded={aperto}
          aria-controls="audit-immobile-elenco"
          aria-autocomplete="list"
          autoComplete="off"
          value={valore}
          onChange={(evento) => {
            onValoreChange(evento.target.value);
            // Riscrivere a mano stacca il collegamento: il testo non
            // corrisponde più alla scheda, e salvare su quell'immobile una
            // checklist intestata a un altro sarebbe peggio che non salvare.
            if (immobileId) onImmobileChange(null);
            setAperto(true);
            setEvidenziato(0);
          }}
          onFocus={() => setAperto(true)}
          onKeyDown={suTastiera}
          placeholder="Cerca in portafoglio o scrivi un riferimento (es. Via Roma 12)"
          className="input-field h-11 w-full pl-9 text-base sm:h-10 sm:text-sm"
        />
      </div>

      {collegato ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-status-qualified/10 px-2.5 py-1 font-medium text-status-qualified">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Collegato a {collegato.reference}
          </span>
          <span className="text-muted-foreground">La checklist si salva su questa scheda.</span>
          <button
            type="button"
            onClick={() => onImmobileChange(null)}
            className="inline-flex min-h-11 items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline md:mouse:min-h-0"
          >
            <Link2Off className="h-3.5 w-3.5" aria-hidden="true" />
            Scollega
          </button>
        </p>
      ) : (
        valore.trim() && (
          <p className="mt-2 text-xs text-muted-foreground">
            Riferimento scritto a mano: la checklist resta su questa schermata e finisce nel PDF,
            ma non viene salvata su nessuna scheda.
          </p>
        )
      )}

      {aperto && (
        <ul
          id="audit-immobile-elenco"
          role="listbox"
          aria-label="Immobili in portafoglio"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          {immobili === null ? (
            <li className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Caricamento del portafoglio…
            </li>
          ) : filtrati.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-muted-foreground">
              {immobili.length === 0
                ? "Non hai ancora immobili in portafoglio. Scrivi pure un riferimento a mano."
                : "Nessun immobile corrisponde. Il testo che hai scritto va bene comunque."}
            </li>
          ) : (
            filtrati.map((immobile, indice) => (
              <li key={immobile.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={immobile.id === immobileId}
                  onMouseEnter={() => setEvidenziato(indice)}
                  onClick={() => scegli(immobile)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors",
                    indice === evidenziato ? "bg-muted" : "hover:bg-muted/60"
                  )}
                >
                  <Building2
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {immobile.reference} · {immobile.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {immobile.indirizzo ? `${immobile.indirizzo}, ` : ""}
                      {immobile.comune}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
