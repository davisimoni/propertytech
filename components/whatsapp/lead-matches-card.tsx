"use client";

import { useEffect, useState } from "react";
import { Check, Home, Loader2, Send } from "lucide-react";
import { formatPrice } from "@/lib/listings/property-fields";
import { useToast } from "@/components/shared/toast-provider";
import { cn } from "@/lib/utils";

interface MatchView {
  id: string;
  reference: string;
  title: string;
  priceEur: number;
  status: string;
  score: number;
  reasons: string[];
  comune: string;
  zona: string | null;
  images: string[];
}

/** Sotto questa soglia l'abbinamento non merita di essere proposto a un cliente. */
const MIN_SCORE = 80;

/**
 * Immobili del portafoglio compatibili con questo contatto.
 *
 * # Perché si caricano all'apertura
 *
 * L'elenco dei lead si ricarica da solo ogni quindici secondi e restituisce
 * fino a cento contatti: includere qui gli abbinamenti significherebbe pagare
 * quella join cento volte al minuto per un dato che si guarda aprendo una
 * scheda. Stessa scelta già fatta per la cronologia chat.
 *
 * # Perché solo sopra l'80%
 *
 * È la soglia oltre la quale l'abbinamento vale una telefonata. Mostrare anche
 * i parziali riempirebbe la scheda di immobili che l'agente scarta uno per
 * uno, e l'elenco smetterebbe di essere un suggerimento per diventare rumore
 * da filtrare.
 */
export function LeadMatchesCard({ leadId, clientName }: { leadId: string; clientName: string }) {
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errore, setErrore] = useState(false);
  const [inviando, setInviando] = useState<string | null>(null);
  const [inviati, setInviati] = useState<string[]>([]);
  const { showToast } = useToast();

  useEffect(() => {
    let annullato = false;
    setIsLoading(true);
    setErrore(false);

    fetch(`/api/whatsapp/leads/${leadId}/matches`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((data: { matches: MatchView[] }) => {
        if (!annullato) setMatches(data.matches.filter((m) => m.score >= MIN_SCORE));
      })
      .catch(() => {
        if (!annullato) setErrore(true);
      })
      .finally(() => {
        if (!annullato) setIsLoading(false);
      });

    return () => {
      annullato = true;
    };
  }, [leadId]);

  async function proponi(propertyId: string) {
    setInviando(propertyId);
    try {
      const response = await fetch(`/api/whatsapp/leads/${leadId}/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });

      const body = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        showToast(body.message ?? "Invio non riuscito.", "error");
        return;
      }

      setInviati((current) => [...current, propertyId]);
      showToast(`Proposta inviata a ${clientName}.`, "success");
    } catch {
      showToast("Errore di rete durante l'invio.", "error");
    } finally {
      setInviando(null);
    }
  }

  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Home className="h-3.5 w-3.5" />
        Immobili compatibili
        {matches.length > 0 ? (
          <span className="ml-1 rounded-full bg-status-qualified/10 px-1.5 py-0.5 text-[10px] font-semibold text-status-qualified">
            {matches.length}
          </span>
        ) : null}
      </h3>

      {isLoading ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cerco nel portafoglio…
        </p>
      ) : errore ? (
        <p className="mt-2 text-sm text-status-blocked">
          Non è stato possibile caricare gli abbinamenti. Chiudi e riapri la scheda.
        </p>
      ) : matches.length === 0 ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Nessun immobile in portafoglio corrisponde a quello che cerca. Gli abbinamenti si
          ricalcolano da soli quando carichi un immobile nuovo o quando cambiano le sue preferenze.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {matches.map((match) => {
            const copertina = match.images?.[0];
            const inviato = inviati.includes(match.id);

            return (
              <li
                key={match.id}
                className="flex gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40"
              >
                {copertina ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={copertina}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-md object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Home className="h-5 w-5" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="min-w-0 truncate text-sm font-medium text-foreground">
                      {match.title}
                    </p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        match.score >= 90
                          ? "bg-status-qualified/10 text-status-qualified"
                          : "bg-primary/10 text-primary"
                      )}
                    >
                      {match.score}%
                    </span>
                  </div>

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {match.zona ? `${match.comune} — ${match.zona}` : match.comune} ·{" "}
                    <span className="font-medium text-foreground">
                      {formatPrice(match.priceEur)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">Rif. {match.reference}</p>

                  {match.reasons.length > 0 ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {match.reasons.join(" · ")}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => proponi(match.id)}
                    disabled={inviando !== null || inviato}
                    className={cn(
                      "mt-2 inline-flex h-11 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all duration-200 disabled:opacity-60 sm:h-9",
                      inviato
                        ? "border-status-qualified/40 text-status-qualified"
                        : "border-border-strong text-foreground hover:bg-muted"
                    )}
                  >
                    {inviando === match.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : inviato ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    {inviato ? "Proposta inviata" : "Proponi via WhatsApp"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
