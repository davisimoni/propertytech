"use client";

import { useMemo, useState } from "react";
import { Check, Clipboard } from "lucide-react";

/**
 * Kit script e obiezioni per l'acquisizione dell'incarico.
 *
 * # Perché gira tutto nel browser
 *
 * Perché non c'è niente da chiedere a un modello: sono frasi scritte, che
 * cambiano solo per il nome del proprietario e per i numeri dell'immobile.
 * Farle generare costerebbe un credito, aggiungerebbe due secondi di attesa e
 * restituirebbe ogni volta un testo leggermente diverso, quando qui serve il
 * contrario: la stessa risposta, quella che in agenzia funziona, pronta da
 * incollare mentre il proprietario sta scrivendo.
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

export function ScriptObiezioni({ agencyName }: { agencyName: string }) {
  const [proprietario, setProprietario] = useState("");
  const [prezzoTesto, setPrezzoTesto] = useState("");
  const [percentualeTesto, setPercentualeTesto] = useState("3");
  const [copiato, setCopiato] = useState<string | null>(null);

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

  async function copia(id: string, testo: string) {
    await navigator.clipboard.writeText(testo);
    setCopiato(id);
    setTimeout(() => setCopiato(null), 2000);
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

      {/* --- Gli script --- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          Le otto obiezioni che fanno saltare un incarico
        </h2>

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
