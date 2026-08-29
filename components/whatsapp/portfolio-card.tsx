"use client";

import { useState } from "react";
import { Building2, Check, Crown, FileSearch, Loader2, Pencil, ShieldQuestion, X } from "lucide-react";
import {
  deriveSellerCategory,
  formatOwnedProperties,
  isGoldLead,
  MAX_OWNED_PROPERTIES,
  SELLER_CATEGORY_BADGE_CLASSES,
  SELLER_CATEGORY_LABELS,
} from "@/lib/whatsapp/portfolio";
import type { LeadView, PortfolioMatchView } from "@/lib/whatsapp/view-types";
import { cn } from "@/lib/utils";

/** Descrive l'immobile della visura come lo leggerebbe l'agente: "Milano, Fg. 12, Part. 345, Cat. A/3". */
function describeProperty(match: PortfolioMatchView): string {
  return [
    match.comune,
    match.foglio && `Fg. ${match.foglio}`,
    match.particella && `Part. ${match.particella}`,
    match.subalterno && `Sub. ${match.subalterno}`,
    match.categoriaCatastale && `Cat. ${match.categoriaCatastale}`,
  ]
    .filter(Boolean)
    .join(", ");
}

interface PortfolioCardProps {
  lead: LeadView;
  /**
   * Applica il nuovo conteggio nello stato del chiamante.
   *
   * Il componente è volutamente controllato: se tenesse una propria copia del
   * conteggio, il polling della pipeline la sovrascriverebbe ogni 15 secondi e
   * il badge nella lista mostrerebbe un numero diverso da quello nella scheda.
   */
  onUpdated: (ownedPropertiesCount: number | null) => void;
  /**
   * Rimuove dalla lista il match appena deciso e, se confermato, allinea il
   * conteggio. Sta al chiamante perché è lì che vive lo stato dei lead.
   */
  onMatchResolved: (matchId: string, ownedPropertiesCount: number | null) => void;
}

/**
 * "Portafoglio Immobili stimato / Rilevato" nella scheda del lead.
 *
 * Il dato è dichiaratamente una stima: nasce da ciò che il cliente ha detto in
 * chat o dall'incrocio con le visure caricate. Per questo la correzione manuale
 * è a portata di un clic e non nascosta in una schermata di impostazioni.
 */
export function PortfolioCard({ lead, onUpdated, onMatchResolved }: PortfolioCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const count = lead.ownedPropertiesCount;
  const pending = lead.pendingMatches;
  // La categoria si ricalcola dal conteggio invece di leggere
  // `lead.sellerCategory`: sono due campi distinti che viaggiano insieme, e
  // derivarne uno dall'altro elimina la possibilità che si contraddicano.
  const category = deriveSellerCategory(count);
  const isGold = isGoldLead(count);

  async function resolveMatch(matchId: string, decision: "confirm" | "ignore") {
    setResolvingId(matchId);
    setError(null);

    try {
      const response = await fetch(`/api/whatsapp/portfolio-matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Non è stato possibile registrare la decisione. Riprova.");
        return;
      }

      // Su "ignore" il conteggio non cambia: si passa quello attuale, così il
      // chiamante deve solo togliere il match dalla lista.
      onMatchResolved(
        matchId,
        decision === "confirm" ? (body.ownedPropertiesCount as number) : count
      );
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setResolvingId(null);
    }
  }

  function startEditing() {
    setDraft(count === null ? "" : String(count));
    setError(null);
    setIsEditing(true);
  }

  async function save() {
    const trimmed = draft.trim();
    // Campo vuoto = "non rilevato": è diverso da zero, che è una dichiarazione
    // esplicita dell'agente ("questo contatto non ha nulla da vendere").
    const parsed = trimmed === "" ? null : Number(trimmed);

    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_OWNED_PROPERTIES)) {
      setError(`Inserisci un numero intero da 0 a ${MAX_OWNED_PROPERTIES}, oppure lascia vuoto.`);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/whatsapp/leads/${lead.id}/portfolio`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownedPropertiesCount: parsed }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Salvataggio non riuscito. Riprova.");
        return;
      }

      setIsEditing(false);
      onUpdated(body.ownedPropertiesCount as number | null);
    } catch {
      setError("Errore di rete durante il salvataggio.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      className={cn(
        "rounded-lg border p-3",
        isGold ? "border-status-pending/40 bg-status-pending/5" : "border-border"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" />
          Portafoglio Immobili stimato / Rilevato
        </h3>

        {isGold && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-status-pending/15 px-2 py-0.5 text-[11px] font-semibold text-status-pending">
            <Crown className="h-3 w-3" />
            Alta Priorità · Lead Oro
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{formatOwnedProperties(count)}</span>

        {category && (
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              SELLER_CATEGORY_BADGE_CLASSES[category]
            )}
          >
            {SELLER_CATEGORY_LABELS[category]}
          </span>
        )}

        {pending.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-status-pending/10 px-2.5 py-1 text-xs font-medium text-status-pending">
            <ShieldQuestion className="h-3.5 w-3.5" />
            Da verificare
          </span>
        )}
      </div>

      {pending.length > 0 && (
        <ul className="mt-3 space-y-2">
          {pending.map((match) => {
            const isResolving = resolvingId === match.id;

            return (
              <li
                key={match.id}
                className="rounded-lg border border-status-pending/40 bg-status-pending/5 p-3"
              >
                <p className="flex items-start gap-1.5 text-sm text-foreground">
                  <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-status-pending" />
                  <span>
                    Rilevato potenziale immobile in Visura Catastale per questo contatto (
                    {describeProperty(match) || "dati catastali parziali"}). Confermi la
                    corrispondenza?
                  </span>
                </p>

                <p className="mt-1.5 pl-[1.375rem] text-xs text-muted-foreground">
                  Intestatario nella visura: <span className="font-medium">{match.ownerName}</span>
                  {match.quotaProprieta && ` · Quota ${match.quotaProprieta}`}
                </p>

                <div className="mt-2.5 flex flex-wrap gap-2 pl-[1.375rem]">
                  <button
                    type="button"
                    onClick={() => resolveMatch(match.id, "confirm")}
                    disabled={isResolving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gradient px-2.5 py-1.5 text-xs font-medium text-white transition-all duration-200 hover:brightness-110 disabled:opacity-50"
                  >
                    {isResolving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Conferma e Unisci
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveMatch(match.id, "ignore")}
                    disabled={isResolving}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:bg-muted disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Ignora / Omonimia
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isEditing ? (
        <div className="mt-3">
          <label htmlFor={`owned-${lead.id}`} className="text-xs text-muted-foreground">
            Immobili posseduti dal contatto
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id={`owned-${lead.id}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_OWNED_PROPERTIES}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  save();
                }
              }}
              placeholder="Vuoto = non rilevato"
              disabled={isSaving}
              className="input-field flex-1 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={save}
              disabled={isSaving}
              aria-label="Salva immobili posseduti"
              className="inline-flex h-11 w-11 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-brand-gradient text-white transition-all duration-200 hover:brightness-110 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
              aria-label="Annulla modifica"
              className="inline-flex h-11 w-11 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all duration-200 hover:bg-muted disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
        >
          <Pencil className="h-3.5 w-3.5" />
          Modifica / Aggiungi Immobili Posseduti
        </button>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-status-blocked">
          {error}
        </p>
      )}
    </section>
  );
}
