"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Building2, FileText, Link2, Loader2, PenLine, Sparkles, Wand2 } from "lucide-react";
import { IMPORT_PROGRESS, ProgressMessages } from "@/components/shared/progress-messages";
import {
  composeScratchListing,
  emptyScratchListing,
  PROPERTY_CONDITION_LABELS,
  PROPERTY_CONDITION_OPTIONS,
  type ScratchListingFields,
} from "@/lib/social/scratch-listing";
import {
  GENERATION_INTENTS,
  INTENT_HINTS,
  INTENT_LABELS,
  type GenerationIntent,
} from "@/lib/ai/social-schema";
import {
  composePortfolioListing,
  type PortfolioListingSource,
} from "@/lib/social/portfolio-listing";
import { InfoTip } from "@/components/shared/info-tip";
import { cn } from "@/lib/utils";

export interface ImportedListingView {
  propertyTitle: string;
  keyPoints: string;
  zone: string | null;
  squareMeters: string | null;
  price: string | null;
  rooms: string | null;
  /** Campi strutturati che precompilano la scheda di portafoglio. */
  comune: string | null;
  provincia: string | null;
  bathrooms: string | null;
  floor: string | null;
  propertyType: string | null;
  contract: string | null;
  energyClass: string | null;
  strengths: string[];
  missingInfo: string[];
}

/** I campi che `/api/properties` restituisce e che servono a comporre le note. */
interface ImmobileInPortafoglio extends PortfolioListingSource {
  id: string;
  reference: string;
}

type SourceTab = "portafoglio" | "esistente" | "prompt" | "scratch";

const SOURCE_TABS: { id: SourceTab; label: string; icon: typeof Link2 }[] = [
  { id: "portafoglio", label: "Da Portafoglio", icon: Building2 },
  { id: "esistente", label: "Da Link o Testo", icon: Link2 },
  { id: "prompt", label: "Prompt Libero", icon: Sparkles },
  { id: "scratch", label: "Crea da Zero", icon: PenLine },
];

/**
 * Suggerimenti cliccabili per la scheda del prompt libero.
 *
 * Non sono scorciatoie carine: sono le quattro richieste che un agente fa
 * davvero e che, scritte a mano ogni volta, si scrivono male. Si sommano al
 * testo invece di sostituirlo, cosi' se ne possono usare due.
 */
const QUICK_CHIPS = [
  "Evidenzia il ribasso di prezzo",
  "Tono emozionale",
  "Rivolgiti a investitori",
  "Metti al centro terrazzo e spazi esterni",
];

interface ListingImportProps {
  /**
   * Testo controllato dal componente padre, perché è lui a generare: questo
   * riquadro raccoglie la fonte, la generazione la fa chi ha il tono e lo
   * stato dei contenuti.
   */
  rawText: string;
  onRawTextChange: (value: string) => void;
  /**
   * Titolo e punti chiave: la stessa coppia che il padre manda al
   * generatore quando non c'è un testo incollato. "Crea da zero" li scrive
   * componendo cinque campi separati invece di uno solo — vedi
   * `lib/social/scratch-listing.ts` — ma restano gli stessi due valori,
   * quindi il generatore non sa e non deve sapere da quale scheda arrivano.
   */
  propertyTitle: string;
  onPropertyTitleChange: (value: string) => void;
  keyPoints: string;
  onKeyPointsChange: (value: string) => void;
  /** Riempie la scheda di portafoglio coi dati estratti dal link. */
  /** Cosa farne del testo incollato: cambia il prompt, non i fatti. */
  intent: GenerationIntent;
  onIntentChange: (value: GenerationIntent) => void;
  /** Istruzione libera dell'agente, per la scheda "Prompt Libero". */
  freePrompt: string;
  onFreePromptChange: (value: string) => void;
  onImported: (listing: ImportedListingView) => void;
  onLocked: () => void;
  /**
   * Tono di voce e pulsante di generazione, resi dal padre e mostrati qui
   * sotto la textarea.
   *
   * Passati come contenuto invece di essere ricostruiti qui perché dipendono
   * da stato che vive nel generatore — il tono scelto, la generazione in
   * corso, i contenuti già prodotti. Duplicarlo per averlo in questo riquadro
   * significherebbe tenerne due copie sincronizzate a mano.
   */
  footer?: ReactNode;
}

/**
 * Il punto di partenza di /social: la fonte da cui generare, e i comandi.
 *
 * # Tre schede, non due sezioni impilate
 *
 * C'erano solo Link e Testo, una sopra l'altra con un "oppure" in mezzo: le
 * uniche due fonti previste erano un annuncio che esiste già da qualche
 * parte. Un agente che deve pubblicizzare un immobile appena acquisito, prima
 * ancora di scrivere un annuncio, non aveva un punto da cui partire — doveva
 * inventarsi due righe di testo finto solo per superare la soglia minima del
 * riquadro sottostante.
 *
 * "Crea da zero" è la terza scheda: cinque campi mirati (tipologia e zona,
 * prezzo e metratura, piano e caratteristiche, stato, punti di forza) al
 * posto di un testo libero. Non è una terza strada per il generatore — vedi
 * `lib/social/scratch-listing.ts` — è la stessa coppia titolo/punti chiave
 * che "Estrai da Link" scrive da un annuncio esistente, composta qui da un
 * annuncio che ancora non c'è.
 *
 * # Perché i pannelli restano montati cambiando scheda
 *
 * Perché un clic per sbirciare un'altra scheda non deve costare quello che
 * l'agente ha già scritto. Stesso principio di `ModuleWithHistory`: si
 * nascondono con una classe, non si smontano.
 */
export function ListingImport({
  rawText,
  onRawTextChange,
  propertyTitle,
  onPropertyTitleChange,
  keyPoints,
  onKeyPointsChange,
  intent,
  onIntentChange,
  freePrompt,
  onFreePromptChange,
  onImported,
  onLocked,
  footer,
}: ListingImportProps) {
  const [error, setError] = useState<string | null>(null);
  const [sourceTab, setSourceTab] = useState<SourceTab>("portafoglio");

  const [url, setUrl] = useState("");

  /*
   * Il portafoglio, caricato una volta sola all'apertura.
   *
   * `null` significa "sto ancora leggendo", array vuoto "non ne hai": sono
   * due schermate diverse, e ridurle a un unico stato mostrerebbe "non hai
   * immobili" per il secondo che serve alla chiamata.
   */
  const [immobili, setImmobili] = useState<ImmobileInPortafoglio[] | null>(null);
  const [immobileScelto, setImmobileScelto] = useState("");

  useEffect(() => {
    fetch("/api/properties")
      .then((r) => (r.ok ? r.json() : null))
      .then((dati) => setImmobili((dati?.properties ?? []) as ImmobileInPortafoglio[]))
      // Silenzio: la scheda mostra "non hai immobili" e le altre tre restano
      // utilizzabili. Un errore rosso qui bloccherebbe una pagina che funziona.
      .catch(() => setImmobili([]));
  }, []);

  /**
   * Riempie titolo e note dai dati della scheda immobile.
   *
   * Scrive negli STESSI due campi che compilano le altre schede: il
   * generatore non sa da dove arrivano, e non deve saperlo.
   */
  function scegliImmobile(id: string) {
    setImmobileScelto(id);
    const immobile = immobili?.find((i) => i.id === id);
    if (!immobile) return;

    const composto = composePortfolioListing(immobile);
    onPropertyTitleChange(composto.propertyTitle);
    onKeyPointsChange(composto.keyPoints);
  }
  const [isExtracting, setIsExtracting] = useState(false);

  /** Serve a portare il cursore nel riquadro quando il portale blocca il link. */
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /*
   * I cinque campi grezzi vivono qui, non nel padre.
   *
   * Il padre ha bisogno solo del risultato — `propertyTitle` e `keyPoints`,
   * già composti — non dei cinque valori singoli: non li manda da nessuna
   * parte, non li mostra altrove. Restano comunque anche cambiando scheda,
   * perché questo pannello non si smonta.
   */
  const [scratch, setScratch] = useState<ScratchListingFields>(emptyScratchListing());

  function aggiornaScratch(parziale: Partial<ScratchListingFields>) {
    const prossimo = { ...scratch, ...parziale };
    setScratch(prossimo);
    const composto = composeScratchListing(prossimo);
    onPropertyTitleChange(composto.propertyTitle);
    onKeyPointsChange(composto.keyPoints);
  }

  async function handleExtractUrl() {
    setIsExtracting(true);
    setError(null);

    try {
      const response = await fetch("/api/social/extract-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (response.status === 402) {
        onLocked();
        return;
      }

      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Non è stato possibile leggere il link.");
        // Il messaggio rimanda al riquadro del testo: passare a quella
        // scheda e portarci il cursore trasforma un'istruzione in un gesto
        // già iniziato, invece di un rimando che l'agente deve interpretare.
        setSourceTab("esistente");
        textareaRef.current?.focus();
        return;
      }

      // Il testo estratto finisce nel riquadro insieme ai campi compilati: se
      // il modello ha letto male un dato, l'agente ha la fonte davanti da
      // correggere invece di dover riaprire il link e ricopiare tutto.
      if (typeof body.rawText === "string") onRawTextChange(body.rawText);
      onImported(body.listing as ImportedListingView);
    } catch {
      setError("Errore di rete durante la lettura del link.");
    } finally {
      setIsExtracting(false);
    }
  }

  const canExtract = /^https?:\/\/\S+$/i.test(url.trim());
  // Solo la lettura del link resta un'attesa da segnalare qui: la
  // generazione ha il suo indicatore accanto al proprio pulsante.
  const isBusy = isExtracting;

  return (
    <section className="rounded-xl border border-primary/25 bg-primary/5 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Wand2 className="h-4 w-4 text-primary" />
        Da dove partiamo
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Incolla il link dell&apos;annuncio, il testo copiato da un portale, un&apos;email o il
        gestionale — oppure, se l&apos;annuncio non esiste ancora, compila il modulo rapido.
      </p>

      <div
        role="tablist"
        aria-label="Fonte dell'annuncio"
        className="mt-4 flex flex-wrap gap-1 border-b border-border"
      >
        {SOURCE_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={sourceTab === id}
            onClick={() => setSourceTab(id)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-xs font-medium transition-colors duration-200 sm:min-h-9",
              sourceTab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* --- Da portafoglio --- */}
      <div className={cn("mt-4 space-y-3", sourceTab === "portafoglio" ? undefined : "hidden")}>
        <div>
          <label
            htmlFor="pf-immobile"
            className="flex items-center gap-1 text-xs font-medium text-foreground"
          >
            Scegli un immobile già in portafoglio
            <InfoTip label="Prende i dati dalla scheda dell'immobile — tipologia, zona, prezzo, metratura, locali, classe energetica — e li usa come note per la generazione. Ti risparmia di riscriverli, e non inventa i campi che in scheda sono vuoti." />
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Prende dalla scheda tipologia, zona, prezzo, metratura e caratteristiche: non devi
            riscriverli. È la strada più rapida quando l&apos;immobile è già tuo.
          </p>
        </div>

        {immobili === null ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Caricamento del portafoglio…
          </p>
        ) : immobili.length === 0 ? (
          <p className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
            Non hai ancora immobili in portafoglio. Usa una delle altre schede, oppure salvane uno
            da Portafoglio Immobili.
          </p>
        ) : (
          <>
            <select
              id="pf-immobile"
              value={immobileScelto}
              onChange={(e) => scegliImmobile(e.target.value)}
              className="input-field h-11 w-full bg-card text-base sm:h-10 sm:text-sm"
            >
              <option value="">— Seleziona —</option>
              {immobili.map((imm) => (
                <option key={imm.id} value={imm.id}>
                  {imm.reference} · {imm.title}
                </option>
              ))}
            </select>
            {immobileScelto && (
              <p className="text-xs text-muted-foreground">
                Dati caricati nelle note. Scegli il tono qui sotto e premi Genera.
              </p>
            )}
          </>
        )}
      </div>

      {/* --- Prompt libero --- */}
      <div className={cn("mt-4 space-y-3", sourceTab === "prompt" ? undefined : "hidden")}>
        <div>
          <label
            htmlFor="pf-prompt"
            className="flex items-center gap-1 text-xs font-medium text-foreground"
          >
            Scrivi tu l&apos;istruzione
            <InfoTip label="Descrivi taglio e immobile in una frase. L'istruzione dice all'AI COME scrivere, non le fornisce fatti nuovi: se chiedi di citare una caratteristica che non hai indicato, quella parte viene ignorata." />
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Per chi sa già cosa vuole. Descrivi il taglio e l&apos;immobile in una frase:
            l&apos;AI userà solo quello che scrivi qui, senza aggiungere dati che non hai dato.
          </p>
        </div>

        <textarea
          id="pf-prompt"
          value={freePrompt}
          onChange={(e) => onFreePromptChange(e.target.value)}
          rows={4}
          placeholder="Es. Scrivi un post ironico per le storie IG su un attico con terrazzo a Vignola"
          className="input-field bg-card"
        />

        {/* I suggerimenti si SOMMANO al testo invece di sostituirlo: se ne
            usano due insieme, ed e' il caso normale ("tono emozionale" +
            "evidenzia il ribasso"). */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() =>
                onFreePromptChange(freePrompt.trim() ? `${freePrompt.trim()}. ${chip}` : chip)
              }
              className="inline-flex h-11 items-center gap-1 rounded-full border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-foreground sm:h-8"
            >
              + {chip}
            </button>
          ))}
        </div>
      </div>

      {/* --- Da link o testo --- */}
      <div className={cn("mt-4 space-y-4", sourceTab === "esistente" ? undefined : "hidden")}>
        <div>
        <label htmlFor="listing-url" className="block text-xs font-medium text-foreground">
          Incolla il link dell&apos;annuncio
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            id="listing-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            className="input-field bg-card sm:flex-1"
            aria-describedby="listing-url-help"
            disabled={isBusy}
          />
          <button
            type="button"
            onClick={handleExtractUrl}
            disabled={!canExtract || isBusy}
            className="btn-brand shrink-0 justify-center"
          >
            {isExtracting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            {isExtracting ? "Lettura del link…" : "Estrai da Link"}
          </button>
        </div>
        <p id="listing-url-help" className="mt-1.5 text-xs text-muted-foreground">
          Ideale per il sito della tua agenzia, i portali locali, il gestionale e le pagine che si
          caricano da sole. <span className="font-medium text-foreground">Immobiliare.it e
          Idealista</span> respingono le letture automatiche: per quei due usa direttamente la
          casella di testo qui sotto, che funziona sempre.
        </p>
        </div>

        <div>
        <label htmlFor="listing-text" className="block text-xs font-medium text-foreground">
          Incolla il testo dell&apos;annuncio
        </label>
        <textarea
          id="listing-text"
          ref={textareaRef}
          value={rawText}
          onChange={(event) => onRawTextChange(event.target.value)}
          rows={6}
          placeholder="Incolla qui il testo della scheda immobile o dell'annuncio…"
          className="input-field mt-1.5 bg-card"
          aria-describedby="listing-text-help"
        />
        <p id="listing-text-help" className="mt-1.5 text-xs text-muted-foreground">
          Il metodo più rapido e sempre valido, anche per i portali protetti. Bastano i dati
          essenziali: tipologia, metratura, zona, prezzo e caratteristiche. L&apos;AI userà solo
          ciò che è scritto, senza inventare nulla.
        </p>
        </div>

        {/* Il selettore di intento.

            Lo stesso annuncio incollato va trattato in tre modi diversi a
            seconda di cosa se ne vuole fare, e l'agente lo sa gia' mentre
            incolla: chiederglielo qui costa un clic e cambia il risultato piu'
            di qualunque aggiustamento del tono. */}
        <fieldset>
          <legend className="flex items-center gap-1 text-xs font-medium text-foreground">
            Cosa vuoi ottenere
            <InfoTip label="Lo stesso annuncio va trattato in modo diverso a seconda dello scopo: sintetizzarlo per i social, ripulirlo se viene da un privato, o riproporlo se è fermo da tempo. Nessuna delle tre aggiunge dati che il testo non contiene." />
          </legend>
          <div className="mt-1.5 space-y-1.5">
            {GENERATION_INTENTS.map((id) => (
              <label
                key={id}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-colors duration-200",
                  intent === id
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <input
                  type="radio"
                  name="intento"
                  value={id}
                  checked={intent === id}
                  onChange={() => onIntentChange(id)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--primary)]"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-foreground">
                    {INTENT_LABELS[id]}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {INTENT_HINTS[id]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {/* --- Crea da zero --- */}
      <div className={cn("mt-4 space-y-3", sourceTab === "scratch" ? undefined : "hidden")}>
        <p className="text-xs text-muted-foreground">
          Per un immobile che non ha ancora un annuncio da nessuna parte. Compila quello che sai:
          basta il primo campo più almeno un altro, il resto lo scrive l&apos;AI a partire da
          questi dati soli — non inventa dettagli che non hai scritto.
        </p>

        <label className="block">
          <span className="text-xs font-medium text-foreground">Tipologia e zona</span>
          <input
            type="text"
            value={scratch.tipologiaZona}
            onChange={(event) => aggiornaScratch({ tipologiaZona: event.target.value })}
            placeholder="Es. Trilocale in centro storico, Bologna"
            className="input-field mt-1.5 bg-card"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-foreground">Prezzo e metratura</span>
          <input
            type="text"
            value={scratch.prezzoMq}
            onChange={(event) => aggiornaScratch({ prezzoMq: event.target.value })}
            placeholder="Es. 250.000€ — 90mq"
            className="input-field mt-1.5 bg-card"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-foreground">Piano e caratteristiche chiave</span>
          <input
            type="text"
            value={scratch.pianoCaratteristiche}
            onChange={(event) => aggiornaScratch({ pianoCaratteristiche: event.target.value })}
            placeholder="Es. 3° piano con ascensore, terrazzo 15mq, luminoso"
            className="input-field mt-1.5 bg-card"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-foreground">Stato immobile</span>
          <select
            value={scratch.condition}
            onChange={(event) =>
              aggiornaScratch({
                condition: event.target.value as ScratchListingFields["condition"],
              })
            }
            className="input-field mt-1.5 bg-card"
          >
            <option value="">Seleziona…</option>
            {PROPERTY_CONDITION_OPTIONS.map((opzione) => (
              <option key={opzione} value={opzione}>
                {PROPERTY_CONDITION_LABELS[opzione]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-foreground">Punti di forza</span>
          <input
            type="text"
            value={scratch.puntiForza}
            onChange={(event) => aggiornaScratch({ puntiForza: event.target.value })}
            placeholder="Es. Vicino alla stazione, garage incluso"
            className="input-field mt-1.5 bg-card"
          />
        </label>
      </div>

      {/* Tono e generazione, dentro lo stesso riquadro dell'input.

          Stavano in una scheda a parte, sotto: fra l'ultimo campo compilato e
          il pulsante che lo usa c'era un bordo, e a quel punto sembra che
          servano due passaggi invece di uno. Qui la sequenza si legge in
          verticale — incolla, scegli il tono, genera — che e' anche l'ordine
          in cui le tre cose si fanno. */}
      {footer && <div className="mt-4 border-t border-border pt-4">{footer}</div>}

      {error && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-status-pending/30 bg-status-pending/10 p-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-pending" />
          <p className="text-xs text-foreground">{error}</p>
        </div>
      )}

      {isBusy && <ProgressMessages messages={IMPORT_PROGRESS} className="mt-3 block" />}
    </section>
  );
}
