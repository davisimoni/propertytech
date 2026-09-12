"use client";

import { useState } from "react";
import { Check, ChevronDown, Clipboard, EyeOff } from "lucide-react";
import { AMBITO_LABELS, type AmbitoDocumento } from "@/lib/ai/document-schema";
import {
  FEEDBACK_CATEGORY_LABELS,
  SENTIMENT_LABELS,
  type FeedbackCategory,
} from "@/lib/ai/report-schema";
import type { HistoryKind } from "@/lib/history/entries";
import { humanizeKey } from "@/lib/history/output-text";
import { useToast } from "@/components/shared/toast-provider";
import { FormattedOutput, Strutturato } from "./formatted-output";
import { cn } from "@/lib/utils";

/**
 * Il contenuto del pannello di dettaglio, diviso per aree.
 *
 * # Perché a sezioni e non in un blocco solo
 *
 * Perché i tre moduli producono documenti compositi, non un testo. Un output
 * social contiene un annuncio da portale, uno script per un video e un post:
 * tre cose che si usano in momenti diversi, che nessuno legge insieme, e che
 * incollate una dopo l'altra costringono a cercare con gli occhi il punto in
 * cui una finisce e comincia l'altra. Chiuse, si sceglie quella che serve.
 *
 * # Perché l'accordion è fatto in casa
 *
 * Perché in questo progetto non c'è Radix né Shadcn: aggiungere una
 * dipendenza per aprire e chiudere un riquadro sarebbe sproporzionato. Non è
 * un `<details>` nativo perché l'intestazione deve contenere **due** comandi
 * indipendenti — apri/chiudi e copia — e dentro un `<summary>` il secondo
 * verrebbe inghiottito dal primo: cliccare "copia" aprirebbe anche la sezione.
 *
 * # Perché resta un ripiego generico
 *
 * Le forme riconosciute sono quelle prodotte dagli schemi di oggi. Un record
 * salvato prima — o da un modulo che cambierà — non deve sparire dietro un
 * pannello vuoto: se non corrisponde a nessuna forma nota, si rende com'era
 * reso prima.
 */

function Sezione({
  titolo,
  nota,
  interna,
  apertaDiDefault = false,
  testo,
  children,
}: {
  titolo: string;
  /** Riga di contesto sotto il titolo: dice a cosa serve la sezione. */
  nota?: string;
  /** Marca il contenuto come interno all'agenzia, da non inoltrare a terzi. */
  interna?: boolean;
  apertaDiDefault?: boolean;
  /** Testo copiato dal pulsante della sezione; assente = niente pulsante. */
  testo?: string;
  children: React.ReactNode;
}) {
  const [aperta, setAperta] = useState(apertaDiDefault);
  const [copiato, setCopiato] = useState(false);
  const { showToast } = useToast();

  async function copia() {
    if (!testo) return;
    try {
      await navigator.clipboard.writeText(testo);
      setCopiato(true);
      showToast(`${titolo}: testo copiato.`, "success");
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      showToast("Il browser non ha concesso l'accesso agli appunti.", "error");
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-stretch gap-1 bg-muted/40 pr-1.5">
        <button
          type="button"
          onClick={() => setAperta((corrente) => !corrente)}
          aria-expanded={aperta}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              aperta && "rotate-180"
            )}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground">{titolo}</span>
              {interna && (
                <span className="inline-flex items-center gap-1 rounded-full bg-status-pending/10 px-2 py-0.5 text-[11px] font-medium text-status-pending">
                  <EyeOff className="h-3 w-3" aria-hidden="true" />
                  Solo uso interno
                </span>
              )}
            </span>
            {nota && (
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{nota}</span>
            )}
          </span>
        </button>

        {/* Fuori dal pulsante che apre, non dentro: due comandi annidati
            reagirebbero allo stesso clic. */}
        {testo && (
          <button
            type="button"
            onClick={copia}
            aria-label={`Copia: ${titolo}`}
            className="my-1.5 inline-flex shrink-0 items-center gap-1.5 self-center rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            {copiato ? (
              <Check className="h-3.5 w-3.5 text-status-qualified" aria-hidden="true" />
            ) : (
              <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{copiato ? "Copiato" : "Copia"}</span>
          </button>
        )}
      </div>

      {aperta && <div className="border-t border-border p-3">{children}</div>}
    </section>
  );
}

/** Paragrafo di prosa: mantiene gli a capo del modello. */
function Prosa({ testo }: { testo: string }) {
  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{testo}</p>;
}

function Elenco({ voci }: { voci: readonly string[] }) {
  if (voci.length === 0) {
    return <p className="text-sm text-muted-foreground">Nessuna voce.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {voci.map((voce, i) => (
        <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
          {voce}
        </li>
      ))}
    </ul>
  );
}

// --- Riconoscimento delle forme note -------------------------------------

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const testoDi = (value: unknown): string => (typeof value === "string" ? value : "");
const elencoDi = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/** Versione testuale di un oggetto, per il pulsante di copia della sezione. */
function flattenLeggibile(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) {
    return value
      .map((v) => flattenLeggibile(v))
      .filter(Boolean)
      .join("\n");
  }
  if (isObj(value)) {
    return Object.entries(value)
      .map(([chiave, valore]) => {
        const reso = flattenLeggibile(valore);
        if (!reso) return "";
        return reso.includes("\n")
          ? `${humanizeKey(chiave)}:\n${reso}`
          : `${humanizeKey(chiave)}: ${reso}`;
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(value);
}

// --- Social & Annunci -----------------------------------------------------

interface Scena {
  timeRange?: unknown;
  voiceover?: unknown;
  visual?: unknown;
}

function SezioniSocial({ output }: { output: Record<string, unknown> }) {
  const portale = isObj(output.portalListing) ? output.portalListing : {};
  const post = isObj(output.socialPost) ? output.socialPost : {};
  const reel = isObj(output.reelScript) ? output.reelScript : {};

  const titoloAnnuncio = testoDi(portale.title);
  const corpoAnnuncio = testoDi(portale.body);
  const chiavi = elencoDi(portale.seoKeywords);

  const scene: Scena[] = Array.isArray(reel.scenes) ? (reel.scenes as Scena[]) : [];
  const hook = testoDi(reel.hook);
  const cta = testoDi(reel.callToAction);

  const caption = testoDi(post.caption);
  const hashtag = elencoDi(post.hashtags);

  // Il testo copiato è quello che si incolla davvero: per il portale titolo e
  // corpo, senza le parole chiave, che servono a chi scrive e non al lettore.
  const testoAnnuncio = [titoloAnnuncio, corpoAnnuncio].filter(Boolean).join("\n\n");
  const testoReel = [
    hook && `HOOK: ${hook}`,
    ...scene.map((s) =>
      [testoDi(s.timeRange), testoDi(s.voiceover), testoDi(s.visual) && `(${testoDi(s.visual)})`]
        .filter(Boolean)
        .join(" — ")
    ),
    cta && `CTA: ${cta}`,
  ]
    .filter(Boolean)
    .join("\n");
  const testoPost = [caption, hashtag.map((h) => `#${h}`).join(" ")].filter(Boolean).join("\n\n");

  return (
    <div className="space-y-2">
      <Sezione
        titolo="Annuncio per i portali"
        nota="Da incollare su Immobiliare.it, Idealista o nel gestionale."
        apertaDiDefault
        testo={testoAnnuncio}
      >
        <div className="space-y-3">
          {titoloAnnuncio && (
            <p className="text-sm font-semibold text-foreground">{titoloAnnuncio}</p>
          )}
          {corpoAnnuncio && <Prosa testo={corpoAnnuncio} />}
          {chiavi.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Parole chiave usate
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {chiavi.map((chiave) => (
                  <span
                    key={chiave}
                    className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {chiave}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Sezione>

      <Sezione
        titolo="Script Reel / TikTok"
        nota={scene.length > 0 ? `${scene.length} scene, circa 30 secondi.` : undefined}
        testo={testoReel}
      >
        <div className="space-y-3">
          {hook && (
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                Primi 3 secondi
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">{hook}</p>
            </div>
          )}

          {/* Una scheda per scena: girare un reel vuol dire seguire l'elenco
              una riga per volta, con la ripresa accanto a cosa si dice. */}
          {scene.map((scena, i) => (
            <div key={i} className="rounded-lg border border-border p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {testoDi(scena.timeRange) || `Scena ${i + 1}`}
              </p>
              {testoDi(scena.voiceover) && (
                <p className="mt-1 text-sm leading-relaxed text-foreground">
                  {testoDi(scena.voiceover)}
                </p>
              )}
              {testoDi(scena.visual) && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Ripresa: {testoDi(scena.visual)}
                </p>
              )}
            </div>
          ))}

          {cta && (
            <div className="rounded-lg bg-muted/50 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Chiusura
              </p>
              <p className="mt-1 text-sm text-foreground">{cta}</p>
            </div>
          )}
        </div>
      </Sezione>

      <Sezione
        titolo="Post Instagram / Facebook"
        nota={hashtag.length > 0 ? `${hashtag.length} hashtag pronti.` : undefined}
        testo={testoPost}
      >
        <div className="space-y-3">
          {caption && <Prosa testo={caption} />}
          {hashtag.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hashtag.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </Sezione>
    </div>
  );
}

// --- Analisi Documenti ----------------------------------------------------

interface VoceAltriDati {
  ambito?: unknown;
  voce?: unknown;
  dettaglio?: unknown;
}

interface Criticita {
  livello?: unknown;
  titolo?: unknown;
  dettaglio?: unknown;
}

const CLASSI_CRITICITA: Record<string, string> = {
  alta: "border-status-blocked/30 bg-status-blocked/5",
  media: "border-status-pending/30 bg-status-pending/5",
  informativa: "border-border bg-muted/30",
};

function ElencoAltriDati({ voci }: { voci: VoceAltriDati[] }) {
  if (voci.length === 0) {
    return <p className="text-sm text-muted-foreground">Il documento non ne riporta.</p>;
  }

  return (
    <div className="space-y-2">
      {voci.map((voce, i) => (
        <div key={i} className="rounded-lg border border-border p-2.5">
          <p className="text-sm font-medium text-foreground">{testoDi(voce.voce)}</p>
          {testoDi(voce.dettaglio) && (
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
              {testoDi(voce.dettaglio)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function testoAltriDati(voci: VoceAltriDati[]): string {
  return voci
    .map((v) => [testoDi(v.voce), testoDi(v.dettaglio)].filter(Boolean).join(": "))
    .join("\n");
}

function SezioniDocumento({ output }: { output: Record<string, unknown> }) {
  const altri: VoceAltriDati[] = Array.isArray(output.altriDati)
    ? (output.altriDati as VoceAltriDati[])
    : [];
  const perAmbito = (ambito: AmbitoDocumento) => altri.filter((v) => testoDi(v.ambito) === ambito);

  const provenienza = perAmbito("provenienza");
  const formalita = perAmbito("formalita");
  const edilizia = [...perAmbito("titolo_edilizio"), ...perAmbito("condominio")];

  const criticita: Criticita[] = Array.isArray(output.criticita)
    ? (output.criticita as Criticita[])
    : [];

  const sintesi = testoDi(output.sintesiAgente);
  const note = isObj(output.noteVincoli) ? output.noteVincoli : null;
  const noteDettagli = note ? testoDi(note.dettagli) : "";

  const essenziali = {
    datiImmobile: output.datiImmobile,
    proprietari: output.proprietari,
    pertinenze: output.pertinenze,
  };

  return (
    <div className="space-y-2">
      <Sezione
        titolo="Dati essenziali e sintesi"
        nota="Immobile, intestatari e identificativi catastali."
        apertaDiDefault
        testo={[sintesi, flattenLeggibile(essenziali)].filter(Boolean).join("\n\n")}
      >
        <div className="space-y-4">
          {sintesi && (
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-2.5">
              <Prosa testo={sintesi} />
            </div>
          )}
          <Strutturato value={essenziali} />
        </div>
      </Sezione>

      {/* Le criticità prima della provenienza: sono il motivo per cui un
          agente riapre un'estrazione. */}
      <Sezione
        titolo={`Criticità rilevate${criticita.length ? ` (${criticita.length})` : ""}`}
        nota="Elementi da verificare prima di procedere."
        testo={criticita
          .map((c) => [testoDi(c.titolo), testoDi(c.dettaglio)].filter(Boolean).join(": "))
          .join("\n")}
      >
        {criticita.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun rilievo emerso dal documento.</p>
        ) : (
          <div className="space-y-2">
            {criticita.map((voce, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg border p-2.5",
                  CLASSI_CRITICITA[testoDi(voce.livello)] ?? CLASSI_CRITICITA.informativa
                )}
              >
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground">{testoDi(voce.titolo)}</span>
                  <span className="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
                    {humanizeKey(testoDi(voce.livello))}
                  </span>
                </p>
                {testoDi(voce.dettaglio) && (
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    {testoDi(voce.dettaglio)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Sezione>

      <Sezione
        titolo={AMBITO_LABELS.provenienza}
        nota="Atti da cui deriva la proprietà attuale."
        testo={testoAltriDati(provenienza)}
      >
        <ElencoAltriDati voci={provenienza} />
      </Sezione>

      <Sezione
        titolo={AMBITO_LABELS.formalita}
        nota="Ipoteche, pignoramenti, trascrizioni e note."
        testo={[testoAltriDati(formalita), noteDettagli].filter(Boolean).join("\n")}
      >
        <div className="space-y-3">
          <ElencoAltriDati voci={formalita} />
          {noteDettagli && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Note e annotazioni
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">{noteDettagli}</p>
            </div>
          )}
        </div>
      </Sezione>

      {/* Titoli edilizi e condominio non stanno in nessuna delle due sezioni
          sopra, e lasciarli fuori li farebbe sparire dall'estrazione. */}
      <Sezione
        titolo="Titoli edilizi e condominio"
        nota="CILA, SCIA, permessi, millesimi e delibere."
        testo={testoAltriDati(edilizia)}
      >
        <ElencoAltriDati voci={edilizia} />
      </Sezione>
    </div>
  );
}

// --- Report Venditori -----------------------------------------------------

interface FeedbackVoce {
  category?: unknown;
  sentiment?: unknown;
  detail?: unknown;
}

const CLASSI_SENTIMENT: Record<string, string> = {
  positivo: "bg-status-qualified/10 text-status-qualified",
  neutro: "bg-muted text-muted-foreground",
  negativo: "bg-status-blocked/10 text-status-blocked",
};

/** Etichette già definite accanto allo schema: "stato_immobile" è "Stato
 *  dell'immobile", che `humanizeKey` non saprebbe ricostruire. */
function etichettaCategoria(value: unknown): string {
  const chiave = testoDi(value);
  return FEEDBACK_CATEGORY_LABELS[chiave as FeedbackCategory] ?? humanizeKey(chiave);
}

function etichettaSentiment(value: unknown): string {
  const chiave = testoDi(value);
  return SENTIMENT_LABELS[chiave as keyof typeof SENTIMENT_LABELS] ?? humanizeKey(chiave);
}

function SezioniReport({
  output,
  transcript,
}: {
  output: Record<string, unknown>;
  transcript?: string | null;
}) {
  const messaggio = testoDi(output.sellerMessage);
  const sintesi = testoDi(output.visitSummary);
  const interesse = testoDi(output.interestLevel);
  const prezzo = testoDi(output.priceObservation);
  const azioni = elencoDi(output.recommendedActions);
  const feedback: FeedbackVoce[] = Array.isArray(output.feedback)
    ? (output.feedback as FeedbackVoce[])
    : [];
  const interno = isObj(output.agentSummary) ? output.agentSummary : null;

  const testoEsito = [
    sintesi,
    interesse && `Interesse: ${humanizeKey(interesse)}`,
    prezzo && `Prezzo: ${prezzo}`,
    feedback.map((f) => `${etichettaCategoria(f.category)}: ${testoDi(f.detail)}`).join("\n"),
    azioni.length ? `Azioni consigliate:\n${azioni.map((a) => `- ${a}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const testoInterno = interno
    ? [
        elencoDi(interno.keyPoints).length
          ? `Punti chiave:\n${elencoDi(interno.keyPoints)
              .map((p) => `- ${p}`)
              .join("\n")}`
          : "",
        elencoDi(interno.objections).length
          ? `Obiezioni:\n${elencoDi(interno.objections)
              .map((p) => `- ${p}`)
              .join("\n")}`
          : "",
        elencoDi(interno.technicalFeedback).length
          ? `Rilievi tecnici:\n${elencoDi(interno.technicalFeedback)
              .map((p) => `- ${p}`)
              .join("\n")}`
          : "",
        testoDi(interno.nextAction) && `Prossima azione: ${testoDi(interno.nextAction)}`,
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";

  return (
    <div className="space-y-2">
      {/* Separata dall'esito completo: il pulsante di copia di questa sezione
          deve dare esattamente il messaggio che parte su WhatsApp, non il
          report intero. */}
      <Sezione
        titolo="Messaggio per il proprietario"
        nota="Pronto da inviare su WhatsApp o per email."
        apertaDiDefault
        testo={messaggio}
      >
        {messaggio ? (
          <div className="rounded-lg border border-status-qualified/25 bg-status-qualified/5 p-3">
            <Prosa testo={messaggio} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Questo report non contiene un messaggio pronto.
          </p>
        )}
      </Sezione>

      <Sezione
        titolo="Esito della visita"
        nota="Il contenuto del report consegnato al proprietario."
        testo={testoEsito}
      >
        <div className="space-y-3">
          {sintesi && <Prosa testo={sintesi} />}

          <div className="flex flex-wrap gap-1.5">
            {interesse && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Interesse: {humanizeKey(interesse)}
              </span>
            )}
            {typeof output.visitorCount === "number" && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {output.visitorCount} in visita
              </span>
            )}
          </div>

          {feedback.length > 0 && (
            <div className="space-y-1.5">
              {feedback.map((voce, i) => (
                <div key={i} className="rounded-lg border border-border p-2.5">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">
                      {etichettaCategoria(voce.category)}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        CLASSI_SENTIMENT[testoDi(voce.sentiment)] ?? CLASSI_SENTIMENT.neutro
                      )}
                    >
                      {etichettaSentiment(voce.sentiment)}
                    </span>
                  </p>
                  {testoDi(voce.detail) && (
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                      {testoDi(voce.detail)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {prezzo && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Osservazione sul prezzo
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">{prezzo}</p>
            </div>
          )}

          {azioni.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Azioni consigliate
              </p>
              <div className="mt-1.5">
                <Elenco voci={azioni} />
              </div>
            </div>
          )}
        </div>
      </Sezione>

      {interno && (
        <Sezione
          titolo="Sintesi interna per l'agente"
          nota="Linguaggio schietto: non entra nel PDF né nel messaggio al proprietario."
          interna
          testo={testoInterno}
        >
          <div className="space-y-3">
            {testoDi(interno.nextAction) && (
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                  Prossima azione
                </p>
                <p className="mt-1 text-sm text-foreground">{testoDi(interno.nextAction)}</p>
              </div>
            )}

            {(
              [
                ["Punti chiave", elencoDi(interno.keyPoints)],
                ["Obiezioni emerse", elencoDi(interno.objections)],
                ["Rilievi tecnici", elencoDi(interno.technicalFeedback)],
              ] as const
            ).map(([titolo, voci]) =>
              voci.length > 0 ? (
                <div key={titolo}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {titolo}
                  </p>
                  <div className="mt-1.5">
                    <Elenco voci={voci} />
                  </div>
                </div>
              ) : null
            )}
          </div>
        </Sezione>
      )}

      <Sezione
        titolo="Trascrizione della nota"
        nota="Il dettato originale dell'agente, senza riformulazioni."
        interna
        testo={transcript ?? undefined}
      >
        {transcript ? (
          <Prosa testo={transcript} />
        ) : (
          <p className="text-sm text-muted-foreground">
            La trascrizione non è disponibile per questo report.
          </p>
        )}
      </Sezione>
    </div>
  );
}

// --- Ingresso -------------------------------------------------------------

export function DetailSections({
  output,
  kind,
  transcript,
}: {
  output: unknown;
  kind: HistoryKind;
  transcript?: string | null;
}) {
  if (isObj(output)) {
    if (
      (kind === "SOCIAL" || kind === "LISTING") &&
      (isObj(output.portalListing) || isObj(output.socialPost) || isObj(output.reelScript))
    ) {
      return <SezioniSocial output={output} />;
    }

    if (kind === "DOCUMENT_EXTRACTION" && isObj(output.datiImmobile)) {
      return <SezioniDocumento output={output} />;
    }

    if (kind === "VOICE_REPORT" && typeof output.sellerMessage === "string") {
      return <SezioniReport output={output} transcript={transcript} />;
    }
  }

  // Forma non riconosciuta: meglio il rendering generico di un pannello vuoto.
  return <FormattedOutput output={output} />;
}
