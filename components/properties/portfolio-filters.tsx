"use client";

import type { PropertyStatus, PropertyType } from "@prisma/client";
import { Search, X } from "lucide-react";
import {
  PROPERTY_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/lib/listings/property-fields";

/**
 * Ricerca e filtri del portafoglio.
 *
 * # Perché serviva
 *
 * Perché era l'unico elenco dell'app senza: il Radar ha i suoi filtri, la
 * pipeline dei lead pure, e il portafoglio — che è la lista destinata a
 * crescere di più — si scorreva a mano. Con quaranta immobili, trovare
 * "quel trilocale a Sesto" significava scorrere finché non compariva.
 *
 * # Perché la ricerca è un campo solo
 *
 * Perché l'agente cerca per come ricorda l'immobile, e non ricorda in quale
 * campo stia il dato: a volte il riferimento, più spesso il comune o due
 * parole del titolo. Tre caselle separate lo costringerebbero a indovinare
 * quale usare.
 */

export interface FiltriPortafoglio {
  testo: string;
  tipo: PropertyType | "";
  stato: PropertyStatus | "";
  prezzoMax: string;
  prezzoMqMax: string;
}

export const FILTRI_VUOTI: FiltriPortafoglio = {
  testo: "",
  tipo: "",
  stato: "",
  prezzoMax: "",
  prezzoMqMax: "",
};

export function haFiltriAttivi(filtri: FiltriPortafoglio): boolean {
  return Object.values(filtri).some((valore) => valore !== "");
}

/** Il minimo che serve per filtrare: il resto della scheda non c'entra. */
export interface ImmobileFiltrabile {
  reference: string;
  title: string;
  comune: string;
  zona: string | null;
  type: PropertyType;
  status: PropertyStatus;
  priceEur: number;
  squareMeters: number;
}

/**
 * Vero se l'immobile supera i filtri attivi.
 *
 * # Perche' esportata e non annidata nel componente
 *
 * Perche' e' la regola che decide cosa l'agente vede, e dentro una `.filter()`
 * in mezzo al JSX nessun test la raggiunge. I casi che contano non sono
 * ovvi: un immobile con zero metri quadri non ha un prezzo al metro, e
 * scartarlo dal filtro "€/mq max" lo farebbe sparire dall'elenco per un dato
 * che non esiste.
 */
export function passaFiltri(immobile: ImmobileFiltrabile, filtri: FiltriPortafoglio): boolean {
  if (filtri.tipo && immobile.type !== filtri.tipo) return false;
  if (filtri.stato && immobile.status !== filtri.stato) return false;

  const prezzoMax = Number(filtri.prezzoMax);
  if (filtri.prezzoMax && Number.isFinite(prezzoMax) && immobile.priceEur > prezzoMax) {
    return false;
  }

  const prezzoMqMax = Number(filtri.prezzoMqMax);
  // Con metratura a zero il prezzo al metro non esiste: l'immobile NON viene
  // scartato, perche' non sappiamo se supererebbe la soglia.
  if (filtri.prezzoMqMax && Number.isFinite(prezzoMqMax) && immobile.squareMeters > 0) {
    if (immobile.priceEur / immobile.squareMeters > prezzoMqMax) return false;
  }

  const testo = filtri.testo.trim().toLowerCase();
  if (!testo) return true;

  // Si cerca in tutti i campi con cui un agente ricorda un immobile, non in
  // uno solo: il riferimento se ce l'ha sottomano, altrimenti il comune o due
  // parole del titolo.
  return [immobile.reference, immobile.title, immobile.comune, immobile.zona ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(testo);
}

export function PortfolioFilters({
  filtri,
  onChange,
  risultati,
  totale,
}: {
  filtri: FiltriPortafoglio;
  onChange: (filtri: FiltriPortafoglio) => void;
  risultati: number;
  totale: number;
}) {
  const attivi = haFiltriAttivi(filtri);

  function aggiorna<K extends keyof FiltriPortafoglio>(
    campo: K,
    valore: FiltriPortafoglio[K]
  ) {
    onChange({ ...filtri, [campo]: valore });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={filtri.testo}
          onChange={(e) => aggiorna("testo", e.target.value)}
          placeholder="Cerca per riferimento, titolo, comune o zona…"
          aria-label="Cerca nel portafoglio"
          className="input-field h-11 w-full pl-9 sm:h-10"
        />
      </div>

      {/* I filtri sotto la ricerca, in griglia: su telefono vanno a capo da
          soli invece di comprimersi in caselle illeggibili. */}
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground">Tipologia</span>
          <select
            value={filtri.tipo}
            onChange={(e) => aggiorna("tipo", e.target.value as PropertyType | "")}
            className="input-field mt-1 h-11 w-full sm:h-10"
          >
            <option value="">Tutte</option>
            {Object.entries(PROPERTY_TYPE_LABELS).map(([valore, etichetta]) => (
              <option key={valore} value={valore}>
                {etichetta}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground">Stato</span>
          <select
            value={filtri.stato}
            onChange={(e) => aggiorna("stato", e.target.value as PropertyStatus | "")}
            className="input-field mt-1 h-11 w-full sm:h-10"
          >
            <option value="">Tutti</option>
            {Object.entries(PROPERTY_STATUS_LABELS).map(([valore, etichetta]) => (
              <option key={valore} value={valore}>
                {etichetta}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground">Prezzo max (€)</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            value={filtri.prezzoMax}
            onChange={(e) => aggiorna("prezzoMax", e.target.value)}
            placeholder="es. 250000"
            className="input-field mt-1 h-11 w-full sm:h-10"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground">€/mq max</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={filtri.prezzoMqMax}
            onChange={(e) => aggiorna("prezzoMqMax", e.target.value)}
            placeholder="es. 2500"
            className="input-field mt-1 h-11 w-full sm:h-10"
          />
        </label>
      </div>

      {attivi && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{risultati}</span> di {totale} immobili
          </p>
          <button
            type="button"
            onClick={() => onChange(FILTRI_VUOTI)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <X className="h-3.5 w-3.5" />
            Azzera i filtri
          </button>
        </div>
      )}
    </div>
  );
}
