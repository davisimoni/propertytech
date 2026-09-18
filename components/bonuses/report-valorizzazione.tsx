"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { useToast } from "@/components/shared/toast-provider";
import { downloadPdf, fetchPdfBranding } from "@/lib/pdf/client";
import type { ValuationInput } from "@/lib/pdf/valuation-document";
import { cn } from "@/lib/utils";

/**
 * Il documento di valorizzazione da lasciare al proprietario.
 *
 * # Perché il PDF si compone nel browser
 *
 * Perché il contenuto lo scrive l'agente e non c'è niente da salvare: il
 * documento nasce, viene scaricato e finisce in mano al proprietario. Una
 * rotta server aggiungerebbe una copia di quei dati sui nostri sistemi senza
 * che serva a nessuno, e il logo dell'agenzia lo prende comunque dal profilo.
 *
 * # Perché le voci di promozione sono caselle e non testo libero
 *
 * Perché è la parte che l'agente scrive sempre uguale e che al proprietario
 * interessa di più: trasformarla in caselle da spuntare fa uscire il documento
 * in un minuto invece che in dieci, che è la differenza fra consegnarlo e
 * rimandarlo a domani.
 */

const PROMOZIONE = [
  "Servizio fotografico professionale",
  "Pubblicazione su Immobiliare.it, Idealista e Casa.it",
  "Post e campagne su Facebook e Instagram",
  "Video di presentazione per i social",
  "Presentazione ai clienti già in archivio",
  "Visite accompagnate solo con persone qualificate",
  "Aggiornamento periodico sull'andamento delle visite",
  "Gestione dei documenti fino al rogito",
];

const righeDa = (testo: string): string[] =>
  testo
    .split("\n")
    .map((riga) => riga.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);

export function ReportValorizzazione() {
  const { showToast } = useToast();
  const [inCorso, setInCorso] = useState(false);

  const [indirizzo, setIndirizzo] = useState("");
  const [proprietario, setProprietario] = useState("");
  const [prezzoConsigliato, setPrezzoConsigliato] = useState("");
  const [prezzoRichiesto, setPrezzoRichiesto] = useState("");
  const [superficie, setSuperficie] = useState("");
  const [tempistiche, setTempistiche] = useState("");
  const [puntiDiForza, setPuntiDiForza] = useState("");
  const [interventi, setInterventi] = useState("");
  const [note, setNote] = useState("");
  const [promozione, setPromozione] = useState<string[]>(PROMOZIONE.slice(0, 5));

  const pronto = indirizzo.trim().length > 2;

  function commuta(voce: string) {
    setPromozione((attuali) =>
      attuali.includes(voce) ? attuali.filter((v) => v !== voce) : [...attuali, voce]
    );
  }

  async function genera() {
    if (!pronto) return;
    setInCorso(true);

    try {
      const dati: ValuationInput = {
        indirizzo,
        proprietario,
        prezzoConsigliato,
        prezzoRichiesto,
        superficie,
        tempistiche,
        puntiDiForza: righeDa(puntiDiForza),
        interventi: righeDa(interventi),
        // Nell'ordine in cui compaiono nell'elenco, non in quello in cui sono
        // state spuntate: il documento deve leggersi uguale ogni volta.
        promozione: PROMOZIONE.filter((voce) => promozione.includes(voce)),
        note,
      };

      const [branding, { ValuationDocument }] = await Promise.all([
        fetchPdfBranding(),
        import("@/lib/pdf/valuation-document"),
      ]);

      const nomeFile = `valorizzazione-${
        indirizzo
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40) || "immobile"
      }.pdf`;

      await downloadPdf(<ValuationDocument branding={branding} dati={dati} />, nomeFile);
    } catch {
      showToast("Non siamo riusciti a generare il PDF. Riprova.", "error");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <h2 className="text-sm font-semibold text-foreground">L&apos;immobile</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Indirizzo o riferimento
            </span>
            <input
              type="text"
              value={indirizzo}
              onChange={(e) => setIndirizzo(e.target.value)}
              placeholder="Es. Via Roma 12, Monza"
              className="input-field mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Proprietario</span>
            <input
              type="text"
              value={proprietario}
              onChange={(e) => setProprietario(e.target.value)}
              placeholder="Es. signora Bianchi"
              className="input-field mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Prezzo di presentazione consigliato
            </span>
            <input
              type="text"
              value={prezzoConsigliato}
              onChange={(e) => setPrezzoConsigliato(e.target.value)}
              placeholder="Es. 245.000 €"
              className="input-field mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Valore indicato dalla proprietà
            </span>
            <input
              type="text"
              value={prezzoRichiesto}
              onChange={(e) => setPrezzoRichiesto(e.target.value)}
              placeholder="Es. 270.000 €"
              className="input-field mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Superficie</span>
            <input
              type="text"
              value={superficie}
              onChange={(e) => setSuperficie(e.target.value)}
              placeholder="Es. 95 mq commerciali"
              className="input-field mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Tempi stimati</span>
            <input
              type="text"
              value={tempistiche}
              onChange={(e) => setTempistiche(e.target.value)}
              placeholder="Es. 3 o 4 mesi al prezzo consigliato"
              className="input-field mt-1"
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 md:p-5">
          <label className="block">
            <span className="text-sm font-semibold text-foreground">Punti di forza</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Uno per riga. Finiscono nel documento come elenco.
            </span>
            <textarea
              value={puntiDiForza}
              onChange={(e) => setPuntiDiForza(e.target.value)}
              rows={5}
              placeholder={"Doppia esposizione\nTerrazzo abitabile\nBox auto di proprietà"}
              className="input-field mt-2 resize-y"
            />
          </label>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 md:p-5">
          <label className="block">
            <span className="text-sm font-semibold text-foreground">
              Interventi che alzano il valore
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Uno per riga. È la parte che il proprietario rilegge la sera.
            </span>
            <textarea
              value={interventi}
              onChange={(e) => setInterventi(e.target.value)}
              rows={5}
              placeholder={"Tinteggiatura delle pareti\nSostituzione della caldaia\nRiordino e alleggerimento degli arredi"}
              className="input-field mt-2 resize-y"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <h2 className="text-sm font-semibold text-foreground">Come promuoviamo l&apos;immobile</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Spunta quello che l&apos;agenzia fa davvero su questo incarico.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PROMOZIONE.map((voce) => {
            const attiva = promozione.includes(voce);
            return (
              <button
                key={voce}
                type="button"
                onClick={() => commuta(voce)}
                aria-pressed={attiva}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  attiva
                    ? "border-primary/40 bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    attiva ? "border-primary bg-primary text-white" : "border-border-strong"
                  )}
                >
                  {attiva ? "✓" : ""}
                </span>
                <span className="min-w-0">{voce}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <label className="block">
          <span className="text-sm font-semibold text-foreground">Note per il proprietario</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Es. La valutazione tiene conto delle tre vendite più recenti nello stesso isolato."
            className="input-field mt-2 resize-y"
          />
        </label>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={genera}
          disabled={!pronto || inCorso}
          className="btn-brand w-full sm:w-auto"
        >
          {inCorso ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileDown className="h-4 w-4" aria-hidden="true" />
          )}
          Genera il PDF
        </button>
        <p className="text-xs text-muted-foreground">
          {pronto
            ? "Il documento esce con il logo e i dati dell'agenzia presi dal profilo."
            : "Inserisci almeno l'indirizzo dell'immobile."}
        </p>
      </div>
    </div>
  );
}
