"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Clipboard } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Verifica dei documenti prima di raccogliere una proposta.
 *
 * # Cosa fa e cosa non fa
 *
 * Mette in fila le cose che nella pratica fermano un rogito e dice quali
 * mancano. **Non certifica niente**: la conformità la attesta un tecnico, la
 * provenienza la verifica il notaio. Venderla come una certificazione
 * esporrebbe l'agenzia esattamente al rischio che questo strumento serve a
 * evitare, ed è la stessa ragione per cui il Fascicolo documentale non è
 * annunciato come antiriciclaggio (CLAUDE.md §3).
 *
 * # Perché tre stati e non una spunta
 *
 * Perché "non l'ho ancora chiesto" e "l'ho chiesto e non c'è" portano a due
 * azioni diverse: la prima è una telefonata, la seconda può essere un tecnico
 * e sei settimane. Una casella sola le confonde, e le sei settimane saltano
 * fuori quando la proposta è già firmata.
 */

type Stato = "ok" | "manca" | "verificare";
type Peso = "bloccante" | "rilevante" | "informativo";

interface Voce {
  id: string;
  gruppo: string;
  titolo: string;
  peso: Peso;
  /** Cosa comporta se manca: è la riga che fa capire perché vale la pena. */
  conseguenza: string;
  /** A chi si chiede, quando manca. */
  richiestaA: string;
}

const VOCI: Voce[] = [
  {
    id: "visura",
    gruppo: "Titolarità",
    titolo: "Visura catastale aggiornata",
    peso: "bloccante",
    conseguenza: "Senza, non sai chi sono davvero gli intestatari né in che quote.",
    richiestaA: "Visura catastale aggiornata (o la carichi in Analisi Documenti)",
  },
  {
    id: "provenienza",
    gruppo: "Titolarità",
    titolo: "Atto di provenienza",
    peso: "bloccante",
    conseguenza: "Il notaio lo chiede sempre. Se è una successione, servono anche accettazione e trascrizione.",
    richiestaA: "Atto di acquisto o dichiarazione di successione",
  },
  {
    id: "formalita",
    gruppo: "Titolarità",
    titolo: "Ipoteche e formalità pregiudizievoli",
    peso: "bloccante",
    conseguenza: "Un'ipoteca non cancellata blocca il rogito o va estinta al saldo: va saputo prima di trattare.",
    richiestaA: "Ispezione ipotecaria aggiornata",
  },
  {
    id: "planimetria",
    gruppo: "Urbanistica",
    titolo: "Planimetria catastale conforme allo stato dei luoghi",
    peso: "bloccante",
    conseguenza: "La difformità catastale rende nullo l'atto se non sanata: sistemarla richiede settimane.",
    richiestaA: "Planimetria catastale e sopralluogo di un tecnico per il confronto",
  },
  {
    id: "titolo-edilizio",
    gruppo: "Urbanistica",
    titolo: "Titolo edilizio o condono",
    peso: "bloccante",
    conseguenza: "Serve la menzione in atto. Su un abuso non sanato la vendita non si fa.",
    richiestaA: "Licenza, concessione, permesso di costruire, SCIA o pratica di condono",
  },
  {
    id: "agibilita",
    gruppo: "Urbanistica",
    titolo: "Agibilità",
    peso: "rilevante",
    conseguenza: "Non blocca sempre la vendita, ma va dichiarata: l'acquirente con mutuo la chiede.",
    richiestaA: "Certificato di agibilità o abitabilità",
  },
  {
    id: "ape",
    gruppo: "Impianti ed energia",
    titolo: "APE in corso di validità",
    peso: "bloccante",
    conseguenza: "Obbligatorio già in annuncio: la classe energetica va indicata nella pubblicità.",
    richiestaA: "Attestato di Prestazione Energetica (dura 10 anni, se non sono cambiati gli impianti)",
  },
  {
    id: "impianti",
    gruppo: "Impianti ed energia",
    titolo: "Dichiarazione di conformità degli impianti",
    peso: "rilevante",
    conseguenza: "Se manca, in atto si dichiara l'assenza: è una leva di sconto per chi compra.",
    richiestaA: "Dichiarazioni di conformità o rispondenza di elettrico e termico",
  },
  {
    id: "caldaia",
    gruppo: "Impianti ed energia",
    titolo: "Libretto di impianto e revisione caldaia",
    peso: "informativo",
    conseguenza: "Un dettaglio che però il perito della banca guarda.",
    richiestaA: "Libretto di impianto con l'ultimo controllo",
  },
  {
    id: "millesimi",
    gruppo: "Condominio",
    titolo: "Spese condominiali e tabelle millesimali",
    peso: "rilevante",
    conseguenza: "Le spese dell'ultimo biennio seguono l'immobile: scoprirle dopo crea contenziosi.",
    richiestaA: "Ultimo consuntivo, preventivo e tabelle millesimali",
  },
  {
    id: "lavori",
    gruppo: "Condominio",
    titolo: "Delibere per lavori straordinari",
    peso: "rilevante",
    conseguenza: "Una facciata deliberata e non pagata cambia il prezzo della trattativa.",
    richiestaA: "Verbali delle ultime assemblee e dichiarazione dell'amministratore",
  },
  {
    id: "vincoli",
    gruppo: "Vincoli e diritti di terzi",
    titolo: "Prelazioni, usufrutto, servitù, locazioni in corso",
    peso: "bloccante",
    conseguenza: "Un inquilino con contratto in corso o una prelazione agraria cambiano tutto il percorso.",
    richiestaA: "Contratti in essere e dichiarazione del proprietario sui diritti di terzi",
  },
];

const ETICHETTA_PESO: Record<Peso, string> = {
  bloccante: "Blocca il rogito",
  rilevante: "Pesa sulla trattativa",
  informativo: "Utile da avere",
};

const STATI: { id: Stato; label: string }[] = [
  { id: "ok", label: "C'è" },
  { id: "manca", label: "Manca" },
  { id: "verificare", label: "Da chiedere" },
];

export function AuditConformita() {
  const [stati, setStati] = useState<Record<string, Stato>>({});
  const [immobile, setImmobile] = useState("");
  const [copiato, setCopiato] = useState(false);

  // In `useCallback` perche' i due `useMemo` qui sotto la usano: senza, la
  // funzione cambierebbe a ogni render e le dipendenze non direbbero il vero.
  const statoDi = useCallback((id: string): Stato => stati[id] ?? "verificare", [stati]);

  const verdetto = useMemo(() => {
    const bloccantiMancanti = VOCI.filter((v) => v.peso === "bloccante" && statoDi(v.id) === "manca");
    const bloccantiAperti = VOCI.filter(
      (v) => v.peso === "bloccante" && statoDi(v.id) === "verificare"
    );
    const rilevantiAperti = VOCI.filter(
      (v) => v.peso === "rilevante" && statoDi(v.id) !== "ok"
    );

    if (bloccantiMancanti.length > 0) {
      return {
        tono: "blocco" as const,
        titolo: "Non raccogliere ancora la proposta",
        testo: `Mancano ${bloccantiMancanti.length} document${bloccantiMancanti.length === 1 ? "o" : "i"} che al rogito serv${bloccantiMancanti.length === 1 ? "e" : "ono"} per forza. Procurateli prima: recuperarli con la proposta firmata significa rinviare, e a volte perdere l'acquirente.`,
      };
    }
    if (bloccantiAperti.length > 0) {
      return {
        tono: "attesa" as const,
        titolo: "Da verificare prima della proposta",
        testo: `Ci sono ${bloccantiAperti.length} punt${bloccantiAperti.length === 1 ? "o" : "i"} ancora da controllare fra quelli che possono fermare il rogito. Una telefonata al proprietario adesso vale sei settimane dopo.`,
      };
    }
    if (rilevantiAperti.length > 0) {
      return {
        tono: "attesa" as const,
        titolo: "Vendibile, con punti aperti",
        testo: "Niente che blocchi il rogito. Restano voci che pesano sulla trattativa: se non le chiarisci tu, le userà l'acquirente per trattare sul prezzo.",
      };
    }
    return {
      tono: "ok" as const,
      titolo: "Pronto per la proposta",
      testo: "Le voci che fermano un rogito risultano tutte a posto. Resta la verifica del notaio, che nessuna checklist sostituisce.",
    };
  }, [statoDi]);

  const daChiedere = VOCI.filter((v) => statoDi(v.id) !== "ok");

  const testoRichiesta = useMemo(() => {
    const intestazione = immobile.trim()
      ? `Documenti da recuperare per ${immobile.trim()}:`
      : "Documenti da recuperare:";
    const righe = daChiedere.map(
      (v) => `- ${v.richiestaA}${statoDi(v.id) === "manca" ? " (risulta mancante)" : ""}`
    );
    return [intestazione, ...righe].join("\n");
  }, [daChiedere, immobile, statoDi]);

  async function copia() {
    await navigator.clipboard.writeText(testoRichiesta);
    setCopiato(true);
    setTimeout(() => setCopiato(false), 2000);
  }

  const gruppi = [...new Set(VOCI.map((v) => v.gruppo))];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            Immobile in verifica (facoltativo)
          </span>
          <input
            type="text"
            value={immobile}
            onChange={(e) => setImmobile(e.target.value)}
            placeholder="Es. Rif. A102, Via Roma 12"
            className="input-field mt-1"
          />
        </label>
      </section>

      {/* --- Il verdetto, in cima: è la risposta alla domanda che si fa
          l'agente aprendo questa pagina. --- */}
      <section
        className={cn(
          "rounded-xl border p-4 md:p-5",
          verdetto.tono === "blocco" && "border-status-blocked/40 bg-status-blocked/5",
          verdetto.tono === "attesa" && "border-status-pending/40 bg-status-pending/5",
          verdetto.tono === "ok" && "border-status-qualified/40 bg-status-qualified/5"
        )}
      >
        <h2 className="text-sm font-semibold text-foreground">{verdetto.titolo}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{verdetto.testo}</p>
      </section>

      {gruppi.map((gruppo) => (
        <section key={gruppo} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {gruppo}
          </h2>

          {VOCI.filter((v) => v.gruppo === gruppo).map((voce) => {
            const stato = statoDi(voce.id);
            return (
              <article key={voce.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="min-w-0 text-sm font-medium text-foreground">{voce.titolo}</h3>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      voce.peso === "bloccante"
                        ? "bg-status-blocked/10 text-status-blocked"
                        : voce.peso === "rilevante"
                          ? "bg-status-pending/10 text-status-pending"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {ETICHETTA_PESO[voce.peso]}
                  </span>
                </div>

                <p className="mt-1 text-xs text-muted-foreground">{voce.conseguenza}</p>

                <div
                  role="group"
                  aria-label={`Stato di ${voce.titolo}`}
                  className="mt-3 flex gap-2"
                >
                  {STATI.map((opzione) => (
                    <button
                      key={opzione.id}
                      type="button"
                      aria-pressed={stato === opzione.id}
                      onClick={() => setStati((attuali) => ({ ...attuali, [voce.id]: opzione.id }))}
                      className={cn(
                        "min-h-11 flex-1 rounded-lg border px-2 text-xs font-medium transition-colors sm:min-h-9",
                        stato === opzione.id
                          ? opzione.id === "ok"
                            ? "border-status-qualified bg-status-qualified/10 text-status-qualified"
                            : opzione.id === "manca"
                              ? "border-status-blocked bg-status-blocked/10 text-status-blocked"
                              : "border-border-strong bg-muted text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {opzione.label}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      ))}

      {/* --- Cosa chiedere al proprietario --- */}
      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <h2 className="text-sm font-semibold text-foreground">Da chiedere al proprietario</h2>
        {daChiedere.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Niente da recuperare: tutte le voci risultano a posto.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              L&apos;elenco è pronto da mandare in chat o da leggere al telefono.
            </p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
              {testoRichiesta}
            </pre>
            <button type="button" onClick={copia} className="btn-brand mt-3 w-full text-xs sm:w-auto">
              {copiato ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Clipboard className="h-4 w-4" aria-hidden="true" />
              )}
              {copiato ? "Copiato" : "Copia l'elenco"}
            </button>
          </>
        )}
      </section>

      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        Questa verifica non certifica la conformità dell&apos;immobile e non sostituisce il
        controllo del tecnico né quello del notaio. Serve a sapere cosa manca finché c&apos;è tempo
        per procurarlo.
      </p>
    </div>
  );
}
