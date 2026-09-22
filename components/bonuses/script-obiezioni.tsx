"use client";

import { useMemo, useState } from "react";
import { Check, Clipboard, Loader2, Sparkles } from "lucide-react";
import {
  PropertyCombobox,
  type ImmobileInPortafoglio,
} from "@/components/properties/property-combobox";
import { UpgradeLimitModal } from "@/components/billing/upgrade-limit-modal";
import { AI_DISCLAIMER } from "@/lib/compliance";

/**
 * Kit script e obiezioni per l'acquisizione dell'incarico.
 *
 * # Due metà con due nature diverse, ed è voluto
 *
 * Gli script dell'acquisizione **girano nel browser**, senza modello: sono
 * frasi scritte una volta, che cambiano solo per il nome del proprietario e
 * per i numeri. Farle generare costerebbe attesa per avere ogni volta un testo
 * leggermente diverso, quando qui serve il contrario: la stessa risposta,
 * quella che in agenzia funziona, pronta mentre il proprietario sta scrivendo.
 *
 * Le obiezioni su misura invece **chiedono al modello**, perché "classe G in
 * un palazzo senza ascensore a 320.000 €" produce obiezioni che nessun elenco
 * fisso può contenere: dipendono dalla combinazione dei dati, non dal singolo
 * dato.
 *
 * # Chi parla a chi, nelle due metà
 *
 * Gli otto script rispondono al **proprietario** durante l'acquisizione
 * dell'incarico. Le obiezioni su misura rispondono a **chi compra**, su quel
 * preciso immobile. Sono due interlocutori diversi e la pagina non li mescola:
 * usare una risposta pensata per il venditore con un acquirente è il modo più
 * rapido di sembrare a disagio.
 *
 * # Perché la forma di cortesia
 *
 * Perché questi testi li legge il proprietario, non l'agente: è l'agenzia che
 * parla a un cliente (CLAUDE.md §1).
 */

interface Script {
  id: string;
  /** Come la sente l'agente, con le sue parole. */
  obiezione: string;
  /** Perché la dice: serve a scegliere la risposta, non a recitarla. */
  sotto: string;
  risposta: (dati: Dati) => string;
}

interface Dati {
  proprietario: string;
  agenzia: string;
  prezzo: number | null;
  percentuale: number;
}

/*
 * `useGrouping: "always"` come in `lib/plans.ts`: su it-IT il separatore delle
 * migliaia di default salta sui numeri a quattro cifre, e una provvigione da
 * 7.500 € usciva "7500 €" accanto a un netto da "240.850 €". Due formati nella
 * stessa riga, davanti al proprietario.
 */
const VALUTA = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
  useGrouping: "always",
});

const soldi = (valore: number) => VALUTA.format(valore);

const nome = (dati: Dati) => (dati.proprietario.trim() ? ` ${dati.proprietario.trim()}` : "");

const SCRIPTS: Script[] = [
  {
    id: "provvigione",
    obiezione: "La provvigione è troppo alta",
    sotto: "Non sta confrontando due agenzie: sta confrontando il costo con il fare da solo.",
    risposta: (d) =>
      `Buongiorno${nome(d)}, capisco la domanda, ed è giusto farla. La provvigione si paga solo a rogito avvenuto: se non vendiamo, non le costa nulla. Dentro ci sono le foto, gli annunci sui portali, la selezione delle persone che vengono a vedere l'immobile e la gestione dei documenti fino al notaio.${
        d.prezzo
          ? ` Sul suo immobile parliamo di ${soldi(Math.round((d.prezzo * d.percentuale) / 100))} più IVA, a risultato ottenuto.`
          : ""
      } La cosa che le conviene guardare è un'altra: quanto incassa alla fine, non quanto paga a metà strada. Le faccio vedere i dati delle ultime vendite in zona?`,
  },
  {
    id: "prezzo",
    obiezione: "Il mio immobile vale di più",
    sotto: "Ha in mente il prezzo di quando ha comprato, o quello del vicino che chiedeva di più.",
    risposta: (d) =>
      `Buongiorno${nome(d)}, il valore non lo decidiamo né io né lei: lo decidono le persone che comprano in questa zona in questo periodo. Le porto i prezzi a cui si è venduto davvero negli ultimi mesi, non quelli a cui si chiede.${
        d.prezzo ? ` Partiamo dalla sua richiesta di ${soldi(d.prezzo)} e vediamo cosa dicono i confronti.` : ""
      } Se i numeri le danno ragione, andiamo con la sua cifra. Se invece dicono altro, meglio saperlo adesso che dopo tre mesi di visite senza offerte.`,
  },
  {
    id: "esclusiva",
    obiezione: "Preferisco darlo a più agenzie",
    sotto: "Crede che più vetrine significhino più compratori. È il contrario.",
    risposta: (d) =>
      `Buongiorno${nome(d)}, lo stesso immobile su più annunci con prezzi diversi dice a chi compra una cosa sola: qui si tratta, aspetto che scenda. Con un incarico solo il prezzo resta uno, la storia dell'immobile resta una, e io posso investirci davvero: servizio fotografico, promozione a pagamento, presentazione ai clienti che ho già in archivio. Le propongo un incarico a tempo: se entro la scadenza non ho fatto quello che le ho promesso, lei è libera.`,
  },
  {
    id: "ci-penso",
    obiezione: "Ci devo pensare",
    sotto: "Manca un pezzo di informazione, oppure deve parlarne con qualcuno.",
    risposta: (d) =>
      `Certo${nome(d)}, è una decisione che va presa con calma. Mi aiuta a capire su cosa vuole riflettere? Se è il prezzo, le mando i confronti della zona. Se sono i tempi, le dico in quanto abbiamo venduto immobili simili. Se deve parlarne in famiglia, posso ripassare quando ci siete tutti: meglio una domanda adesso che un dubbio fra due settimane.`,
  },
  {
    id: "da-solo",
    obiezione: "Provo prima da solo",
    sotto: "Vuole risparmiare la provvigione. Non ha in mente cosa comporta.",
    risposta: (d) =>
      `Ci sta${nome(d)}, molti proprietari partono così. Le dico solo le tre cose che pesano di più: le chiamate arrivano a qualsiasi ora e nove su dieci sono curiosi o altre agenzie; chi compra da un privato si aspetta lo sconto proprio perché non c'è la provvigione; e i documenti (visura, planimetria, conformità, provenienza) li chiede il notaio, non l'acquirente, spesso a trattativa avviata. Se vuole ci provi: le lascio il mio numero e la valutazione scritta. Se fra un mese vuole una mano, ripartiamo da lì.`,
  },
  {
    id: "altra-agenzia",
    obiezione: "Un'altra agenzia me lo valuta di più",
    sotto: "Qualcuno ha comprato l'incarico con un numero alto, sapendo di doverlo abbassare.",
    risposta: (d) =>
      `Le dico come funziona${nome(d)}: prendere l'incarico con un prezzo alto è facile, e infatti capita spesso. Quello che succede dopo lo sa chi ci è passato: due mesi di silenzio, poi la telefonata in cui le chiedono di abbassare. Io preferisco dirle il numero giusto adesso e vendere, invece di tenerla ferma per un numero che nessuno pagherà. Le lascio la valutazione scritta con i confronti: la confronti con l'altra e decida lei.`,
  },
  {
    id: "tempi",
    obiezione: "Quanto tempo ci vuole?",
    sotto: "Ha una scadenza in testa: un trasloco, un altro acquisto, una successione.",
    risposta: (d) =>
      `Dipende soprattutto dal prezzo di partenza${nome(d)}: al prezzo giusto, in questa zona, le prime visite arrivano nelle prime due settimane. Mi dica entro quando le servirebbe chiudere: se ha una scadenza precisa, la strategia cambia, e conviene impostarla adesso invece di rincorrerla dopo.`,
  },
  {
    id: "documenti",
    obiezione: "I documenti li cerco quando serve",
    sotto: "Non sa che un documento mancante può far saltare il rogito già fissato.",
    risposta: (d) =>
      `Le conviene il contrario${nome(d)}, e glielo dico per esperienza: visura, planimetria e conformità degli impianti si controllano prima di mettere l'immobile sul mercato. Se salta fuori una difformità catastale, sistemarla richiede settimane. Trovarla adesso significa arrivare al rogito senza sorprese; trovarla con la proposta firmata significa rimandare, e a volte perdere l'acquirente. Me ne occupo io: le dico cosa serve e cosa manca.`,
  },
];

/**
 * Le obiezioni di chi compra che non dipendono dall'immobile.
 *
 * Valgono per qualsiasi trattativa, quindi non c'è niente da calcolare e non
 * si chiede a un modello: si mostrano subito, mentre l'immobile non è ancora
 * stato indicato. Chi apre questa pagina in mezzo a una telefonata trova
 * qualcosa di utile prima di aver compilato un campo.
 */
const OBIEZIONI_CLASSICHE: ObiezioneAI[] = [
  {
    obiezione: "Ci devo pensare, le faccio sapere",
    script:
      "La ringrazio per la sincerità, è giusto rifletterci. Mi aiuta a capire su cosa vuole ragionare? Se è il prezzo, le preparo il confronto con quello che si è venduto in zona. Se sono gli spazi, possiamo rivederla con calma e con chi decide insieme a lei. Se invece è un'altra cosa, me la dica pure: preferisco una domanda adesso che un dubbio fra due settimane.",
    strategia:
      "\"Ci devo pensare\" quasi mai significa che deve pensarci: significa che c'è un'obiezione che non ha detto. Non insistere sull'immobile, fai emergere quella. Se non risponde, proponi tu le tre ipotesi più probabili: una la riconoscerà.",
  },
  {
    obiezione: "Voglio fare un'offerta più bassa",
    script:
      "Un'offerta si può sempre presentare, ed è mio compito portarla alla proprietà. Le dico come conviene impostarla: un'offerta scritta, con i suoi tempi e le sue condizioni, viene presa sul serio molto più di una cifra detta al telefono. Mi dica la sua cifra e come pensa di pagarla, e le dico subito con che probabilità la vedo accolta.",
    strategia:
      "Non difendere il prezzo e non promettere sconti: sposta il discorso dalla cifra alla forma dell'offerta. Un acquirente che mette per iscritto tempi e modalità è un acquirente serio, e la proprietà valuta quello quanto il numero.",
  },
  {
    obiezione: "Prima devo vendere casa mia",
    script:
      "È la situazione più comune, e si gestisce: l'importante è saperlo adesso. Se vuole, faccio una valutazione della sua senza impegno, così sappiamo con che cifra e con che tempi può muoversi. Da lì possiamo ragionare su una proposta con i tempi giusti, invece di rincorrerli a trattativa avviata.",
    strategia:
      "Non è un rifiuto: è un lead in acquisizione che ti si è appena dichiarato. Porta la conversazione sulla valutazione del suo immobile, che ti dà un secondo incarico e ti dice se la trattativa sta davvero in piedi.",
  },
  {
    obiezione: "Ne ho viste altre che costano meno",
    script:
      "Ha fatto bene a confrontare, è l'unico modo per decidere con la testa. Mi dica quali ha visto e le dico in cosa differiscono davvero: spesso la differenza di prezzo sta in cose che in annuncio non si vedono, come lo stato degli impianti, le spese condominiali o i lavori già deliberati. Se dopo il confronto un'altra resta più adatta a lei, glielo dico io per primo.",
    strategia:
      "Chiedere quali ha visto ti dà due informazioni: il suo budget reale e cosa sta cercando davvero. Non sminuire le altre case, confronta voci concrete. Dichiararsi disposto a mandarlo altrove ti rende credibile su tutto il resto.",
  },
];

interface ObiezioneAI {
  obiezione: string;
  script: string;
  strategia: string;
}

type Paywall = { reason: "limit_reached" | "not_in_plan"; requiredPlan?: string };

export function ScriptObiezioni({ agencyName }: { agencyName: string }) {
  const [proprietario, setProprietario] = useState("");
  const [prezzoTesto, setPrezzoTesto] = useState("");
  const [percentualeTesto, setPercentualeTesto] = useState("3");
  const [copiato, setCopiato] = useState<string | null>(null);

  /* --- L'immobile: da portafoglio oppure scritto a mano --- */
  const [riferimento, setRiferimento] = useState("");
  const [scheda, setScheda] = useState<ImmobileInPortafoglio | null>(null);
  const [tipologia, setTipologia] = useState("");
  const [zona, setZona] = useState("");
  const [puntiDiForza, setPuntiDiForza] = useState("");
  const [criticita, setCriticita] = useState("");

  /* --- La generazione --- */
  const [obiezioni, setObiezioni] = useState<ObiezioneAI[] | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [erroreAi, setErroreAi] = useState<string | null>(null);
  const [paywall, setPaywall] = useState<Paywall | null>(null);

  const prezzo = useMemo(() => {
    const pulito = prezzoTesto.replace(/[^\d]/g, "");
    return pulito ? Number(pulito) : null;
  }, [prezzoTesto]);

  const percentuale = useMemo(() => {
    const valore = Number(percentualeTesto.replace(",", "."));
    return Number.isFinite(valore) && valore > 0 ? valore : 3;
  }, [percentualeTesto]);

  const dati: Dati = { proprietario, agenzia: agencyName, prezzo, percentuale };

  const provvigione = prezzo !== null ? (prezzo * percentuale) / 100 : null;
  const conIva = provvigione !== null ? provvigione * 1.22 : null;

  /**
   * Il contesto ha abbastanza per produrre qualcosa di specifico?
   *
   * Con una scheda collegata sì per definizione. A mano serve almeno un dato
   * su cui poggiare: un prezzo, una zona, una criticità. Senza, il modello
   * scriverebbe le obiezioni generiche che stanno già qui sotto senza costare
   * un'attesa.
   */
  const contestoPronto = Boolean(
    scheda || prezzo || zona.trim() || criticita.trim() || tipologia.trim()
  );

  async function generaObiezioni() {
    setInCorso(true);
    setErroreAi(null);

    try {
      const risposta = await fetch("/api/bonuses/objections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Con la scheda collegata i dati li rilegge il server dal database:
          // qui viaggiano solo l'id e le due cose che in scheda non esistono.
          propertyId: scheda?.id,
          tipologia: scheda ? undefined : tipologia.trim() || undefined,
          prezzoEur: scheda ? undefined : prezzo,
          zona: scheda ? undefined : zona.trim() || undefined,
          puntiDiForza: puntiDiForza.trim() || undefined,
          criticita: criticita.trim() || undefined,
          trattativa: proprietario.trim()
            ? `Il proprietario si chiama ${proprietario.trim()}.`
            : undefined,
        }),
      });

      if (risposta.status === 402) {
        const corpo = await risposta.json().catch(() => null);
        setPaywall(
          corpo?.error === "feature_not_in_plan"
            ? { reason: "not_in_plan", requiredPlan: corpo.requiredPlan }
            : { reason: "limit_reached" }
        );
        return;
      }

      const corpo = await risposta.json().catch(() => null);
      if (!risposta.ok) {
        setErroreAi(corpo?.message ?? "Non sono riuscito a generare le obiezioni.");
        return;
      }

      setObiezioni(corpo.obiezioni as ObiezioneAI[]);
    } catch {
      setErroreAi("Non riesco a contattare il server. Controlla la connessione.");
    } finally {
      setInCorso(false);
    }
  }

  async function copia(id: string, testo: string) {
    await navigator.clipboard.writeText(testo);
    setCopiato(id);
    setTimeout(() => setCopiato(null), 2000);
  }

  if (paywall) {
    return (
      <UpgradeLimitModal
        feature="social"
        reason={paywall.reason}
        requiredPlan={paywall.requiredPlan}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* --- I dati che personalizzano gli script --- */}
      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <h2 className="text-sm font-semibold text-foreground">Dati della trattativa</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Facoltativi. Servono a far uscire i testi già con il nome e i numeri giusti.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Nome del proprietario</span>
            <input
              type="text"
              value={proprietario}
              onChange={(e) => setProprietario(e.target.value)}
              placeholder="Es. signora Bianchi"
              className="input-field mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Prezzo richiesto</span>
            <input
              type="text"
              inputMode="numeric"
              value={prezzoTesto}
              onChange={(e) => setPrezzoTesto(e.target.value)}
              placeholder="Es. 250000"
              className="input-field mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Provvigione (%)</span>
            <input
              type="text"
              inputMode="decimal"
              value={percentualeTesto}
              onChange={(e) => setPercentualeTesto(e.target.value)}
              placeholder="3"
              className="input-field mt-1"
            />
          </label>
        </div>

        {provvigione !== null && conIva !== null && (
          <dl className="mt-4 grid gap-3 rounded-lg border border-primary/25 bg-primary/5 p-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Provvigione</dt>
              <dd className="text-sm font-semibold text-foreground">{soldi(provvigione)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Con IVA al 22%</dt>
              <dd className="text-sm font-semibold text-foreground">{soldi(conIva)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Netto al proprietario</dt>
              <dd className="text-sm font-semibold text-foreground">
                {soldi((prezzo ?? 0) - conIva)}
              </dd>
            </div>
          </dl>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Il netto non comprende imposte, spese notarili a carico del venditore ed eventuali costi
          di sanatoria: è la sola differenza fra prezzo e provvigione.
        </p>
      </section>

      {/* --- L'immobile: dal portafoglio o scritto a mano --- */}
      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <h2 className="text-sm font-semibold text-foreground">Immobile in trattativa</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Serve a calcolare le obiezioni che riceverà <em>questo</em> immobile. Senza, restano
          quelle valide per qualsiasi trattativa.
        </p>

        <div className="mt-4">
          <PropertyCombobox
            valore={riferimento}
            onValoreChange={setRiferimento}
            immobileId={scheda?.id ?? null}
            onImmobileChange={setScheda}
            idPrefisso="obiezioni-immobile"
            label="Immobile dal portafoglio"
            notaCollegato="Prezzo, metratura, zona e classe energetica arrivano dalla scheda."
            notaManuale="Nessuna scheda collegata: compila qui sotto quello che sai."
          />
        </div>

        {scheda ? (
          /* Con la scheda collegata i dati non si ricopiano: si mostrano, così
             l'agente vede su cosa sta ragionando l'AI senza doverli ridigitare. */
          <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs">
            {(
              [
                ["Tipologia", scheda.type ?? null],
                ["Prezzo", scheda.priceEur ? soldi(scheda.priceEur) : null],
                ["Superficie", scheda.squareMeters ? `${scheda.squareMeters} m²` : null],
                ["Zona", scheda.zona ?? scheda.comune],
                ["Classe energetica", scheda.energyClass ?? null],
              ] as [string, string | null][]
            )
              .filter(([, valore]) => Boolean(valore))
              .map(([etichetta, valore]) => (
                <div key={etichetta}>
                  <dt className="text-muted-foreground">{etichetta}</dt>
                  <dd className="font-semibold text-foreground">{valore}</dd>
                </div>
              ))}
          </dl>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Tipologia</span>
              <input
                type="text"
                value={tipologia}
                onChange={(e) => setTipologia(e.target.value)}
                placeholder="Es. trilocale con box"
                className="input-field mt-1"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Città o zona</span>
              <input
                type="text"
                value={zona}
                onChange={(e) => setZona(e.target.value)}
                placeholder="Es. Milano, zona Navigli"
                className="input-field mt-1"
              />
            </label>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Il prezzo è quello che hai scritto sopra in <strong>Prezzo richiesto</strong>:
              non serve ripeterlo.
            </p>
          </div>
        )}

        {/* Valgono in entrambe le modalità: sono le due cose che nessuna
            scheda contiene e che l'agente invece sa, perché ci è stato dentro. */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Punti di forza</span>
            <textarea
              rows={2}
              value={puntiDiForza}
              onChange={(e) => setPuntiDiForza(e.target.value)}
              placeholder="Es. doppia esposizione, spese basse, box doppio"
              className="input-field mt-1 w-full"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Criticità note</span>
            <textarea
              rows={2}
              value={criticita}
              onChange={(e) => setCriticita(e.target.value)}
              placeholder="Es. quarto piano senza ascensore, bagno da rifare"
              className="input-field mt-1 w-full"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => void generaObiezioni()}
          disabled={inCorso || !contestoPronto}
          className="btn-brand mt-4 w-full text-xs disabled:opacity-50 sm:w-auto"
        >
          {inCorso ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          )}
          {inCorso ? "Calcolo le obiezioni…" : "Genera obiezioni su misura"}
        </button>

        {!contestoPronto && (
          <p className="mt-2 text-xs text-muted-foreground">
            Scegli un immobile dal portafoglio, oppure indica almeno prezzo, zona o una
            criticità.
          </p>
        )}

        {erroreAi && (
          <p role="alert" className="mt-2 text-xs text-status-blocked">
            {erroreAi}
          </p>
        )}
      </section>

      {/* --- Le obiezioni di chi compra --- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          {obiezioni
            ? "Obiezioni probabili su questo immobile"
            : "Obiezioni di chi compra, valide in ogni trattativa"}
        </h2>
        {obiezioni && <p className="text-xs text-muted-foreground">{AI_DISCLAIMER}</p>}

        {(obiezioni ?? OBIEZIONI_CLASSICHE).map((voce, indice) => {
          const id = `acquirente-${indice}`;
          return (
            <article key={id} className="rounded-xl border border-border bg-card p-4 md:p-5">
              <h3 className="text-sm font-semibold text-foreground">
                &laquo;{voce.obiezione}&raquo;
              </h3>

              <p className="mt-3 whitespace-pre-line rounded-lg border border-border bg-muted/40 p-3 text-sm leading-relaxed text-foreground">
                {voce.script}
              </p>

              <p className="mt-3 border-l-2 border-primary/30 pl-3 text-xs leading-relaxed text-muted-foreground">
                <strong className="font-semibold text-foreground">Strategia.</strong>{" "}
                {voce.strategia}
              </p>

              <button
                type="button"
                onClick={() => copia(id, voce.script)}
                className="btn-outline mt-3 w-full text-xs sm:w-auto"
              >
                {copiato === id ? (
                  <Check className="h-4 w-4 text-status-qualified" aria-hidden="true" />
                ) : (
                  <Clipboard className="h-4 w-4" aria-hidden="true" />
                )}
                {copiato === id ? "Copiato" : "Copia la risposta"}
              </button>
            </article>
          );
        })}
      </section>

      {/* --- Gli script per il proprietario --- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          Le otto obiezioni che fanno saltare un incarico
        </h2>
        <p className="text-xs text-muted-foreground">
          Queste rispondono al proprietario, durante l&apos;acquisizione: sono un interlocutore
          diverso da chi compra.
        </p>

        {SCRIPTS.map((script) => {
          const testo = script.risposta(dati);
          return (
            <article key={script.id} className="rounded-xl border border-border bg-card p-4 md:p-5">
              <h3 className="text-sm font-semibold text-foreground">
                &laquo;{script.obiezione}&raquo;
              </h3>
              <p className="mt-1 text-xs italic text-muted-foreground">{script.sotto}</p>

              <p className="mt-3 whitespace-pre-line rounded-lg border border-border bg-muted/40 p-3 text-sm leading-relaxed text-foreground">
                {testo}
              </p>

              <button
                type="button"
                onClick={() => copia(script.id, testo)}
                className="btn-outline mt-3 w-full text-xs sm:w-auto"
              >
                {copiato === script.id ? (
                  <Check className="h-4 w-4 text-status-qualified" aria-hidden="true" />
                ) : (
                  <Clipboard className="h-4 w-4" aria-hidden="true" />
                )}
                {copiato === script.id ? "Copiato" : "Copia la risposta"}
              </button>
            </article>
          );
        })}
      </section>
    </div>
  );
}
