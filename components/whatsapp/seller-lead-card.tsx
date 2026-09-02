"use client";

import type { LeadIntent } from "@prisma/client";
import { Home, CalendarCheck, MapPin, Ruler, Wrench, CircleHelp } from "lucide-react";
import { PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";
import type { LeadView } from "@/lib/whatsapp/view-types";
import { cn } from "@/lib/utils";

/**
 * Etichetta e colore dell'intento, in un posto solo.
 *
 * Compare sia sul badge in testa alla scheda sia nella riga dell'elenco: due
 * definizioni divergerebbero al primo ritocco, e un contatto risulterebbe
 * "venditore" in un punto e "acquirente" in un altro.
 */
export const LEAD_INTENT_LABELS: Record<LeadIntent, string> = {
  ACQUISTO: "Acquirente",
  VENDITA: "Potenziale venditore / Incarico",
  ENTRAMBI: "Vende e compra / Incarico",
};

/**
 * Venditore e "entrambi" sono in evidenza; l'acquirente no.
 *
 * Non è una preferenza estetica: su un numero pubblicato sui portali quasi
 * tutti i contatti sono acquirenti, e un badge su ognuno non distinguerebbe
 * niente. Colorare solo i due casi rari è ciò che li rende visibili in un
 * elenco di trenta righe.
 */
export const LEAD_INTENT_CLASSES: Record<LeadIntent, string> = {
  ACQUISTO: "bg-muted text-muted-foreground",
  VENDITA: "bg-status-pending/15 text-status-pending",
  ENTRAMBI: "bg-primary/15 text-primary",
};

export function isSellerIntent(intent: LeadIntent | null): boolean {
  return intent === "VENDITA" || intent === "ENTRAMBI";
}

/** Un dato raccolto, oppure la dichiarazione esplicita che manca ancora. */
function Riga({
  icona: Icona,
  etichetta,
  valore,
}: {
  icona: typeof MapPin;
  etichetta: string;
  valore: string | null;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icona className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{etichetta}</p>
        {/* "Da chiedere" e non un trattino: dice all'agente che quella riga è
            lavoro ancora da fare, non un dato che non esiste. */}
        <p className={cn("text-sm", valore ? "text-foreground" : "text-muted-foreground")}>
          {valore ?? "Da chiedere"}
        </p>
      </div>
    </div>
  );
}

/**
 * Immobile che il contatto vuole vendere: la scheda dell'acquisizione.
 *
 * Compare solo per chi vende. Per un acquirente sarebbe un riquadro di righe
 * vuote in mezzo alla scheda, che è il modo più rapido per far smettere di
 * leggere anche quelle piene.
 */
export function SellerLeadCard({ lead }: { lead: LeadView }) {
  if (!isSellerIntent(lead.intent)) return null;

  const caratteristiche = [
    lead.sellerPropertyType ? PROPERTY_TYPE_LABELS[lead.sellerPropertyType] : null,
    lead.sellerPropertySquareMeters ? `${lead.sellerPropertySquareMeters} mq circa` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const ubicazione = [lead.sellerPropertyComune, lead.sellerPropertyZona]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="rounded-lg border border-status-pending/30 bg-status-pending/5 p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-status-pending">
        <Home className="h-3.5 w-3.5" />
        Immobile da vendere
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Quello che il proprietario ha dichiarato in conversazione. La valutazione la fai tu dopo il
        sopralluogo: l&apos;assistente non ne dà mai una, nemmeno indicativa.
      </p>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <Riga icona={MapPin} etichetta="Ubicazione" valore={ubicazione || null} />
        <Riga icona={Ruler} etichetta="Tipologia e dimensione" valore={caratteristiche || null} />
        <Riga icona={Wrench} etichetta="Stato" valore={lead.sellerPropertyCondition} />
        <Riga icona={CalendarCheck} etichetta="Vuole vendere" valore={lead.sellerTimeframe} />
      </div>

      {/* Il sopralluogo è l'obiettivo della conversazione, quindi ha una riga
          sua e non una casella fra le altre. */}
      <div className="mt-3 flex items-start gap-2 border-t border-status-pending/20 pt-3">
        {lead.sellerValuationInterest === null ? (
          <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <CalendarCheck
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              lead.sellerValuationInterest ? "text-status-qualified" : "text-status-blocked"
            )}
          />
        )}
        <p className="text-sm text-foreground">
          {lead.sellerValuationInterest === null
            ? "Sopralluogo di valutazione non ancora proposto."
            : lead.sellerValuationInterest
              ? "Ha accettato il sopralluogo di valutazione: contattalo per fissarlo."
              : "Ha rifiutato il sopralluogo. Voleva probabilmente solo una stima."}
        </p>
      </div>
    </section>
  );
}
