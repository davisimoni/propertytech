"use client";

import type { LeadIntent } from "@prisma/client";
import { Search, X } from "lucide-react";

/**
 * Ricerca rapida nella pipeline dei lead.
 *
 * # Perché serviva, e perché non basta il filtro di stato che c'era già
 *
 * Perché il filtro di stato risponde a "a che punto sono i miei contatti",
 * che è una domanda da scrivania. Quella che un agente si fa sul campo è
 * un'altra: "come si chiamava quello di Vignola che cercava il trilocale?".
 * Con duecento contatti in pipeline, senza un campo di ricerca l'unica strada
 * era scorrere.
 *
 * # Perché il testo filtra nel browser e lo stato no
 *
 * Perché sono due cose diverse. Lo stato ricarica dal server — cambia
 * l'insieme dei lead, e il server sa filtrarlo meglio con un indice. Il testo
 * lavora su ciò che è già a schermo: una chiamata a ogni tasto premuto
 * renderebbe la ricerca più lenta dello scorrere che sostituisce.
 */

export interface LeadRicercabile {
  clientName: string;
  clientPhone: string;
  propertyRef: string;
  preferredZone: string | null;
  sellerPropertyComune: string | null;
  intent: LeadIntent | null;
}

export type FiltroIntento = "" | "ACQUISTO" | "VENDITA";

/**
 * Vero se il lead supera ricerca e filtro d'intento.
 *
 * # Il caso che non è ovvio
 *
 * Un contatto ENTRAMBI — vende per comprare — deve comparire SIA fra gli
 * acquirenti SIA fra i venditori: è entrambe le cose davvero, ed è anche il
 * contatto più prezioso che l'agenzia possa avere. Trattarlo come una terza
 * categoria a sé lo farebbe sparire da tutti e due gli elenchi, cioè proprio
 * da quelli in cui si va a cercarlo.
 */
export function passaRicercaLead(
  lead: LeadRicercabile,
  testo: string,
  intento: FiltroIntento
): boolean {
  if (intento === "ACQUISTO" && lead.intent !== "ACQUISTO" && lead.intent !== "ENTRAMBI") {
    return false;
  }
  if (intento === "VENDITA" && lead.intent !== "VENDITA" && lead.intent !== "ENTRAMBI") {
    return false;
  }

  const cercato = testo.trim().toLowerCase();
  if (!cercato) return true;

  /*
   * Il telefono si confronta a cifre nude.
   *
   * L'agente lo ricorda come "348 55…" o lo incolla come "+39 348 55…", e in
   * archivio sta in forma normalizzata: senza togliere spazi, prefissi e
   * trattini da entrambe le parti, cercare un numero non trova mai niente —
   * che è il modo più rapido per far concludere che la ricerca è rotta.
   */
  const soloCifre = cercato.replace(/\D/g, "");
  if (soloCifre.length >= 3 && lead.clientPhone.replace(/\D/g, "").includes(soloCifre)) {
    return true;
  }

  return [
    lead.clientName,
    lead.propertyRef,
    lead.preferredZone ?? "",
    lead.sellerPropertyComune ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(cercato);
}

export function LeadSearchBar({
  testo,
  intento,
  onTesto,
  onIntento,
  risultati,
  totale,
}: {
  testo: string;
  intento: FiltroIntento;
  onTesto: (valore: string) => void;
  onIntento: (valore: FiltroIntento) => void;
  risultati: number;
  totale: number;
}) {
  const attivo = testo.trim() !== "" || intento !== "";

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={testo}
            onChange={(e) => onTesto(e.target.value)}
            placeholder="Cerca per nome, telefono, riferimento o zona…"
            aria-label="Cerca nei contatti"
            className="input-field h-11 w-full pl-9 text-base sm:h-10 sm:text-sm"
          />
        </div>

        <label className="block">
          <span className="sr-only">Filtra per intento</span>
          <select
            value={intento}
            onChange={(e) => onIntento(e.target.value as FiltroIntento)}
            className="input-field h-11 w-full text-base sm:h-10 sm:w-44 sm:text-sm"
          >
            <option value="">Acquisto e vendita</option>
            <option value="ACQUISTO">Solo acquirenti</option>
            <option value="VENDITA">Solo venditori</option>
          </select>
        </label>
      </div>

      {attivo && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{risultati}</span> di {totale} contatti
          </p>
          <button
            type="button"
            onClick={() => {
              onTesto("");
              onIntento("");
            }}
            className="inline-flex h-11 items-center gap-1 text-xs font-medium text-primary hover:underline sm:h-auto"
          >
            <X className="h-3.5 w-3.5" />
            Azzera la ricerca
          </button>
        </div>
      )}
    </div>
  );
}
