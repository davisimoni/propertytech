"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clipboard, Cloud, Loader2, MessageSquarePlus } from "lucide-react";
import {
  calcolaIndice,
  calcolaVerdetto,
  ETICHETTA_PESO,
  soloNoteNote,
  soloVociNote,
  statoDi as statoDiMappa,
  STATI,
  testoRichiesta as componiRichiesta,
  VOCI,
  type MappaNote,
  type MappaStati,
} from "@/lib/audit/checklist";
import {
  PropertyCombobox,
  type ImmobileInPortafoglio,
} from "@/components/properties/property-combobox";
import { DownloadPdfButton } from "@/components/shared/download-pdf-button";
import { AuditDocument } from "@/lib/pdf/audit-document";
// Da `file-name`, non da `render`: quest'ultimo è `server-only` e qui siamo
// nel browser, perché il PDF si genera nel browser.
import { buildPdfFileName } from "@/lib/pdf/file-name";
import { cn } from "@/lib/utils";

/**
 * Verifica dei documenti prima di raccogliere una proposta.
 *
 * # Cosa fa e cosa non fa
 *
 * Mette in fila le cose che nella pratica fermano un rogito e dice quali
 * mancano. **Non certifica niente**: la conformità la attesta un tecnico, la
 * provenienza la verifica il notaio.
 *
 * Le voci, il verdetto e l'indice vivono in `lib/audit/checklist.ts`, perché
 * la stessa verità serve anche al PDF e alla rotta che salva.
 *
 * # Perché tre stati e non una spunta
 *
 * Perché "non l'ho ancora chiesto" e "l'ho chiesto e non c'è" portano a due
 * azioni diverse: la prima è una telefonata, la seconda può essere un tecnico
 * e sei settimane. Una casella sola le confonde, e le sei settimane saltano
 * fuori quando la proposta è già firmata.
 *
 * # Il salvataggio segue l'immobile, non la schermata
 *
 * Collegata una scheda di portafoglio, la checklist si salva su quell'immobile
 * e la ritrova chiunque in agenzia la riapra: il sopralluogo lo fa uno, la
 * telefonata all'amministratore un altro. Senza scheda collegata resta sulla
 * schermata e finisce nel PDF, il che è giusto per l'immobile che non è ancora
 * a portafoglio, cioè il caso in cui questa checklist serve di più.
 */

/** Attesa prima di salvare: si scrive una nota, non si preme "salva". */
const RITARDO_SALVATAGGIO_MS = 1200;

type StatoSalvataggio = "inattivo" | "in-corso" | "salvato" | "errore";

export function AuditConformita() {
  const [stati, setStati] = useState<MappaStati>({});
  const [note, setNote] = useState<MappaNote>({});
  const [immobile, setImmobile] = useState("");
  const [scheda, setScheda] = useState<ImmobileInPortafoglio | null>(null);
  const [noteAperte, setNoteAperte] = useState<Record<string, boolean>>({});
  const [copiato, setCopiato] = useState(false);
  const [salvataggio, setSalvataggio] = useState<StatoSalvataggio>("inattivo");

  /*
   * Vero finché la checklist appena caricata non è stata toccata.
   *
   * Senza, il caricamento dei dati dal server farebbe scattare il salvataggio
   * automatico, che riscriverebbe subito ciò che ha appena letto: rumore di
   * rete e, su due schede aperte, una corsa fra due scritture identiche.
   */
  const appenaCaricato = useRef(true);

  const statoDi = useCallback((id: string) => statoDiMappa(stati, id), [stati]);

  /* --- Caricamento della checklist salvata sull'immobile --- */
  useEffect(() => {
    if (!scheda) return;

    let annullato = false;
    appenaCaricato.current = true;

    fetch(`/api/properties/${scheda.id}/audit`)
      .then((r) => (r.ok ? r.json() : null))
      .then((dati) => {
        if (annullato || !dati) return;
        setStati(soloVociNote(dati.states));
        setNote(soloNoteNote(dati.notes));
      })
      // Silenzio: la checklist resta utilizzabile e il salvataggio riproverà.
      // Un errore rosso qui fermerebbe un lavoro che si può fare lo stesso.
      .catch(() => undefined);

    return () => {
      annullato = true;
    };
  }, [scheda]);

  /* --- Salvataggio automatico, quando c'è una scheda collegata --- */
  useEffect(() => {
    if (!scheda) return;
    if (appenaCaricato.current) {
      appenaCaricato.current = false;
      return;
    }

    setSalvataggio("in-corso");

    const attesa = setTimeout(() => {
      fetch(`/api/properties/${scheda.id}/audit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ states: stati, notes: note }),
      })
        .then((risposta) => setSalvataggio(risposta.ok ? "salvato" : "errore"))
        .catch(() => setSalvataggio("errore"));
    }, RITARDO_SALVATAGGIO_MS);

    return () => clearTimeout(attesa);
  }, [scheda, stati, note]);

  const verdetto = useMemo(() => calcolaVerdetto(stati), [stati]);
  const indice = useMemo(() => calcolaIndice(stati), [stati]);
  const daChiedere = VOCI.filter((v) => statoDi(v.id) !== "ok");
  const richiesta = useMemo(() => componiRichiesta(stati, immobile), [stati, immobile]);

  async function copia() {
    await navigator.clipboard.writeText(richiesta);
    setCopiato(true);
    setTimeout(() => setCopiato(false), 2000);
  }

  function scegliScheda(immobileScelto: ImmobileInPortafoglio | null) {
    setScheda(immobileScelto);
    setSalvataggio("inattivo");
    // Scollegando non si svuota la checklist: il lavoro fatto resta sotto gli
    // occhi e finisce comunque nel PDF. Cancellarlo perche' e' cambiato un
    // riferimento sarebbe una perdita silenziosa.
  }

  const gruppi = [...new Set(VOCI.map((v) => v.gruppo))];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <PropertyCombobox
          valore={immobile}
          onValoreChange={setImmobile}
          immobileId={scheda?.id ?? null}
          onImmobileChange={scegliScheda}
          descrizione="Scegli un immobile del portafoglio per ritrovare la checklist ogni volta che la riapri, oppure scrivi un riferimento a mano."
        />

        {scheda && salvataggio !== "inattivo" && (
          <p
            className={cn(
              "mt-3 flex items-center gap-1.5 text-xs",
              salvataggio === "errore" ? "text-status-blocked" : "text-muted-foreground"
            )}
            aria-live="polite"
          >
            {salvataggio === "in-corso" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {salvataggio === "in-corso"
              ? "Salvataggio…"
              : salvataggio === "salvato"
                ? `Salvato su ${scheda.reference}`
                : "Non sono riuscito a salvare. La checklist resta su questa schermata."}
          </p>
        )}
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{verdetto.titolo}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{verdetto.testo}</p>
          </div>
          {/* L'indice accanto al verdetto, non al posto suo: da solo un
              numero verrebbe letto come un voto sull'immobile, che non è. */}
          <div className="shrink-0 text-right">
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {indice.percentuale}%
            </p>
            <p className="text-[11px] text-muted-foreground">
              {indice.aPosto} di {indice.totale} a posto
            </p>
          </div>
        </div>
      </section>

      {gruppi.map((gruppo) => (
        <section key={gruppo} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {gruppo}
          </h2>

          {VOCI.filter((v) => v.gruppo === gruppo).map((voce) => {
            const stato = statoDi(voce.id);
            const notaAperta = noteAperte[voce.id] || Boolean(note[voce.id]);

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

                <div role="group" aria-label={`Stato di ${voce.titolo}`} className="mt-3 flex gap-2">
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

                {/* La nota compare su richiesta: dodici caselle di testo
                    aperte insieme trasformerebbero la checklist in un modulo
                    da compilare, che è l'opposto di quello che serve in
                    appuntamento. */}
                {notaAperta ? (
                  <div className="mt-3">
                    <label htmlFor={`nota-${voce.id}`} className="sr-only">
                      Nota su {voce.titolo}
                    </label>
                    <textarea
                      id={`nota-${voce.id}`}
                      rows={2}
                      value={note[voce.id] ?? ""}
                      onChange={(evento) =>
                        setNote((attuali) => ({ ...attuali, [voce.id]: evento.target.value }))
                      }
                      placeholder="Es. richiesto all'amministratore il 12/3, in arrivo"
                      className="input-field w-full text-sm"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNoteAperte((attuali) => ({ ...attuali, [voce.id]: true }))}
                    className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground md:mouse:min-h-0"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                    Aggiungi una nota
                  </button>
                )}
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
              {richiesta}
            </pre>
            <button type="button" onClick={copia} className="btn-outline mt-3 w-full text-xs sm:w-auto">
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

      {/* --- Il documento da portarsi in appuntamento --- */}
      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <h2 className="text-sm font-semibold text-foreground">Report di conformità</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tutti i controlli in una tabella, con le note e i punti ancora da risolvere. Esce con il
          logo e i dati della tua agenzia presi dal profilo.
        </p>
        <DownloadPdfButton
          className="mt-3"
          label="Scarica Report PDF Conformità"
          fileName={buildPdfFileName(["Verifica_documentale", immobile || "immobile"])}
          buildDocument={(branding) => (
            <AuditDocument
              branding={branding}
              dati={{
                immobile,
                dettagli: scheda
                  ? {
                      comune: scheda.comune,
                      indirizzo: scheda.indirizzo,
                      riferimento: scheda.reference,
                    }
                  : undefined,
                stati,
                note,
              }}
            />
          )}
        />
      </section>

      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        Questa verifica non certifica la conformità dell&apos;immobile e non sostituisce il
        controllo del tecnico né quello del notaio. Serve a sapere cosa manca finché c&apos;è tempo
        per procurarlo.
      </p>
    </div>
  );
}
