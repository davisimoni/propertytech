"use client";

import { useRef, useState, type DragEvent } from "react";
import { Check, ClipboardList, FileAudio, Loader2, Printer, Send, Sparkles, X } from "lucide-react";
import { UpgradeLimitModal } from "@/components/billing/upgrade-limit-modal";
import { ShareActions } from "@/components/shared/share-actions";
import { AiDisclaimer } from "@/components/shared/ai-disclaimer";
import { SellerReportDocument } from "@/lib/pdf/seller-report-document";
import { sellerReportFileName } from "@/lib/pdf/file-name";
import { DownloadPdfButton } from "@/components/shared/download-pdf-button";
import { AI_DISCLAIMER_SHORT } from "@/lib/compliance";
import { AudioRecorder } from "./audio-recorder";
import {
  FEEDBACK_CATEGORY_LABELS,
  SENTIMENT_LABELS,
  type VoiceReportContent,
} from "@/lib/ai/report-schema";
import { REPORT_PROGRESS, ProgressMessages } from "@/components/shared/progress-messages";
import { cn } from "@/lib/utils";

type InputMode = "audio" | "text";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const INTEREST_CLASSES: Record<VoiceReportContent["interestLevel"], string> = {
  alto: "bg-status-qualified/10 text-status-qualified",
  medio: "bg-status-pending/10 text-status-pending",
  basso: "bg-status-blocked/10 text-status-blocked",
};

const SENTIMENT_CLASSES: Record<string, string> = {
  positivo: "bg-status-qualified/10 text-status-qualified",
  neutro: "bg-muted text-muted-foreground",
  negativo: "bg-status-blocked/10 text-status-blocked",
};

export function VoiceReportStudio() {
  const [mode, setMode] = useState<InputMode>("audio");
  const [propertyRef, setPropertyRef] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [notes, setNotes] = useState("");
  /**
   * Sorgente audio unica, con la sua provenienza.
   *
   * Registratore e caricamento file scrivevano entrambi su un solo `File`
   * senza sapere l'uno dell'altro: chi registrava e poi caricava (o
   * viceversa) si ritrovava **due anteprime a schermo** — il player della
   * registrazione e la riga col nome del file — mentre ne partiva una sola,
   * l'ultima scritta. Da lì l'impressione che servissero entrambe. Tenendo
   * accanto al file la sua origine, scegliere una sorgente azzera visibilmente
   * l'altra e a schermo resta sempre esattamente ciò che verrà inviato.
   */
  const [audio, setAudio] = useState<{ file: File; origin: "recording" | "upload" } | null>(null);
  /** Cambiando, rimonta il registratore e ne azzera anteprima e cronometro. */
  const [recorderKey, setRecorderKey] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);

  const [report, setReport] = useState<VoiceReportContent | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Le due 402 non dicono la stessa cosa e non vanno mostrate uguali: a un
   * utente Starter serve sapere che il modulo è di Enterprise, a uno in prova
   * che ha finito i tre report inclusi. Il campo `error` della risposta le
   * distingue (CLAUDE.md §4).
   */
  const [locked, setLocked] = useState<{
    reason: "limit_reached" | "not_in_plan";
    requiredPlan?: string;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  /** Caricamento da dispositivo: sostituisce l'eventuale registrazione. */
  function acceptAudio(file: File) {
    if (file.size > MAX_AUDIO_BYTES) {
      setError("Il file audio supera i 25MB.");
      return;
    }
    setError(null);
    setAudio({ file, origin: "upload" });
    // Il registratore aveva un'anteprima? Va via: da qui in poi parte il file.
    setRecorderKey((key) => key + 1);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) acceptAudio(file);
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    setSent(false);

    try {
      const response =
        mode === "audio" && audio
          ? await (() => {
              const formData = new FormData();
              formData.append("audio", audio.file);
              formData.append("propertyRef", propertyRef);
              formData.append("sellerName", sellerName);
              formData.append("sellerPhone", sellerPhone);
              return fetch("/api/reports/voice-to-report", { method: "POST", body: formData });
            })()
          : await fetch("/api/reports/voice-to-report", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                propertyRef,
                sellerName: sellerName || undefined,
                sellerPhone: sellerPhone || undefined,
                notes,
              }),
            });

      if (response.status === 402) {
        const body = await response.json().catch(() => null);
        setLocked(
          body?.error === "feature_not_in_plan"
            ? { reason: "not_in_plan", requiredPlan: body.requiredPlan }
            : { reason: "limit_reached" }
        );
        return;
      }

      const body = await response.json();

      if (!response.ok) {
        const issues = body.issues as Record<string, string[]> | undefined;
        const firstIssue = issues ? Object.values(issues).flat()[0] : undefined;
        setError(body.message ?? firstIssue ?? "Generazione del report non riuscita.");
        return;
      }

      setReport(body.report as VoiceReportContent);
      setReportId(body.reportId as string);
      setTranscript(body.transcript as string);
    } catch {
      setError("Errore di rete durante la generazione del report.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSend() {
    if (!reportId) return;
    setIsSending(true);
    setError(null);

    try {
      const response = await fetch(`/api/reports/${reportId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerPhone: sellerPhone || undefined }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(
          body.error === "whatsapp_not_connected"
            ? "WhatsApp non è collegato. Configuralo in Qualifica Lead per inviare il report."
            : body.error === "missing_seller_phone"
              ? "Inserisci il numero del proprietario per inviare il report."
              : (body.message ?? "Invio non riuscito.")
        );
        return;
      }

      setSent(true);
    } catch {
      setError("Errore di rete durante l'invio.");
    } finally {
      setIsSending(false);
    }
  }

  const canGenerate =
    propertyRef.trim().length >= 3 &&
    // Basta UNA sorgente audio, registrata o caricata: `audio` ne contiene una
    // sola per costruzione, quindi non c'è modo di richiederle entrambe.
    (mode === "audio" ? Boolean(audio) : notes.trim().length >= 20);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-4 md:p-5 print:hidden">
        <h2 className="text-sm font-semibold text-foreground">Nota post-visita</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label htmlFor="property-ref" className="text-xs font-medium text-muted-foreground">
              Immobile visitato
            </label>
            <input
              id="property-ref"
              type="text"
              value={propertyRef}
              onChange={(event) => setPropertyRef(event.target.value)}
              placeholder="Rif. A102 — Trilocale Via Roma 12"
              className="mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground sm:text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="seller-name" className="text-xs font-medium text-muted-foreground">
              Proprietario (opzionale)
            </label>
            <input
              id="seller-name"
              type="text"
              value={sellerName}
              onChange={(event) => setSellerName(event.target.value)}
              placeholder="Sig.ra Bianchi"
              className="mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground sm:text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div>
            <label htmlFor="seller-phone" className="text-xs font-medium text-muted-foreground">
              WhatsApp proprietario
            </label>
            <input
              id="seller-phone"
              type="tel"
              value={sellerPhone}
              onChange={(event) => setSellerPhone(event.target.value)}
              placeholder="+39 333 1234567"
              className="mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground sm:text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          {(
            [
              { value: "audio", label: "Nota vocale" },
              { value: "text", label: "Nota scritta" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              aria-pressed={mode === option.value}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200",
                mode === option.value
                  ? "bg-brand-gradient text-white shadow-sm"
                  : "border border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {mode === "audio" ? (
          <div className="mt-3 space-y-3">
            <AudioRecorder
              key={recorderKey}
              onRecorded={(file) => {
                // Registrare sostituisce un file caricato in precedenza: la
                // riga col nome del file sparisce da sé, perché dipende da
                // `audio.origin`.
                setAudio({ file, origin: "recording" });
                setError(null);
              }}
              onCleared={() =>
                // Il cestino del registratore cancella solo la registrazione,
                // non un file caricato che non gli appartiene.
                setAudio((current) => (current?.origin === "recording" ? null : current))
              }
              disabled={isGenerating}
            />

            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragActive(true);
              }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
              }}
              className={cn(
                "dropzone flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl p-6 text-center",
                isDragActive && "dropzone-active"
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) acceptAudio(file);
                }}
              />
              <FileAudio className="h-6 w-6 text-muted-foreground" />
              {/* Come nella scheda documenti: da telefono si tocca, non si
                  trascina — ed è proprio da telefono che un agente carica il
                  vocale appena registrato dopo una visita. */}
              <p className="text-sm text-foreground sm:hidden">
                Tocca per scegliere un file audio (MP3, WAV, M4A)
              </p>
              <p className="hidden text-sm text-foreground sm:block">
                Oppure trascina qui un file audio (MP3, WAV, M4A)
              </p>
              <p className="text-xs text-muted-foreground">Massimo 25MB</p>
            </div>

            {/* Solo per il file caricato: la registrazione ha già il suo
                player dentro AudioRecorder, e mostrarla due volte era
                esattamente ciò che faceva sembrare necessarie entrambe. */}
            {audio?.origin === "upload" && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <span className="truncate text-sm text-foreground">{audio.file.name}</span>
                <button
                  type="button"
                  onClick={() => setAudio(null)}
                  aria-label="Rimuovi file audio"
                  className="shrink-0 text-muted-foreground hover:text-status-blocked"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <label htmlFor="notes" className="text-xs font-medium text-muted-foreground">
              Note sintetiche della visita
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={5}
              placeholder="Visita con la famiglia Rossi. La casa piace molto, soprattutto la luminosità del soggiorno, ma ritengono la cucina troppo piccola e il prezzo di 250.000€ fuori mercato di almeno 20.000€."
              className="mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground sm:text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/40"
            />
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-status-blocked">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50"
        >
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {/* "Genera report" e basta: l'etichetta lunga andava a capo dentro
              il pulsante su schermo stretto, e il destinatario è già detto
              dal titolo della sezione. */}
          {isGenerating ? "Generazione report in corso…" : "Genera report"}
        </button>

        {isGenerating && <ProgressMessages messages={REPORT_PROGRESS} className="mt-3 block" />}
      </section>

      {report && (
        <section id="seller-report" className="rounded-xl border border-border bg-card p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Report per il proprietario</h2>
              <p className="text-xs text-muted-foreground">{propertyRef}</p>
            </div>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                INTEREST_CLASSES[report.interestLevel]
              )}
            >
              Interesse {report.interestLevel}
            </span>
          </div>

          <p className="mt-4 text-sm text-foreground">{report.visitSummary}</p>

          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Feedback della visita
            </h3>
            <ul className="mt-2 space-y-2">
              {report.feedback.map((item, index) => (
                <li key={index} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-foreground">
                      {FEEDBACK_CATEGORY_LABELS[item.category]}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        SENTIMENT_CLASSES[item.sentiment]
                      )}
                    >
                      {SENTIMENT_LABELS[item.sentiment]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                </li>
              ))}
            </ul>
          </div>

          {report.priceObservation && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Osservazione sul prezzo
              </h3>
              <p className="mt-1 text-sm text-foreground">{report.priceObservation}</p>
            </div>
          )}

          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Azioni consigliate
            </h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
              {report.recommendedActions.map((action, index) => (
                <li key={index}>{action}</li>
              ))}
            </ul>
          </div>

          <div className="mt-5 rounded-lg border border-border bg-muted/40 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Messaggio pronto per il proprietario
            </h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{report.sellerMessage}</p>
            {/* Stesso testo che l'invio automatico aggiunge in coda: copia e
                inoltro manuale non devono uscire senza disclaimer. */}
            <ShareActions
              text={`${report.sellerMessage}\n\n---\n${AI_DISCLAIMER_SHORT}`}
              copyLabel="Copia Testo"
              className="mt-3 print:hidden"
            />
          </div>

          {/* Senza `print:hidden`: il PDF consegnato al proprietario deve
              riportare il disclaimer, perché è il documento che circola
              fuori dall'agenzia. */}
          <AiDisclaimer className="mt-5" />

          {transcript && (
            <details className="mt-4 print:hidden">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                Mostra la trascrizione della nota originale
              </summary>
              <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border p-3 text-xs text-muted-foreground">
                {transcript}
              </p>
            </details>
          )}

          <div className="mt-5 flex flex-wrap gap-2 print:hidden">
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending || sent}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : sent ? (
                <Check className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sent ? "Report inviato" : "Invia Report al Proprietario via WhatsApp"}
            </button>

            {/* Il report è già in memoria: il PDF si costruisce da lì, senza
                tornare al server per rileggere quello che si ha davanti. */}
            {report && (
              <DownloadPdfButton
                buildDocument={(branding) =>
                  SellerReportDocument({
                    branding,
                    report,
                    propertyRef: propertyRef.trim() || "Immobile",
                    sellerName: sellerName.trim() || null,
                  })
                }
                fileName={sellerReportFileName({ propertyRef, sellerName })}
                label="Scarica Report PDF"
              />
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
            >
              <Printer className="h-4 w-4" />
              Stampa
            </button>
          </div>
        </section>
      )}

      {/* --- Sintesi interna per l'agente e il team ---
          `print:hidden` non è un dettaglio estetico: il pulsante Stampa serve
          a produrre il documento per il proprietario, e qui dentro ci sono le
          obiezioni riportate senza addolcirle. Fuori dalla sezione
          `#seller-report` anche nel DOM, così non può finire in una stampa
          parziale di quel blocco. */}
      {report && (
        <section className="rounded-xl border border-dashed border-border bg-muted/20 p-4 md:p-5 print:hidden">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ClipboardList className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Sintesi interna per il team</h2>
              <p className="text-xs text-muted-foreground">
                Solo per te e i tuoi collaboratori: non entra nel PDF, nella stampa né nel
                messaggio inviato al proprietario.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Punti chiave
              </h3>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
                {report.agentSummary.keyPoints.map((point, index) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Obiezioni del cliente
              </h3>
              {report.agentSummary.objections.length > 0 ? (
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
                  {report.agentSummary.objections.map((objection, index) => (
                    <li key={index}>{objection}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Nessuna obiezione emersa dalla nota.
                </p>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Feedback tecnico
              </h3>
              {report.agentSummary.technicalFeedback.length > 0 ? (
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
                  {report.agentSummary.technicalFeedback.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Nessun rilievo tecnico nella nota.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
                Prossima azione
              </h3>
              <p className="mt-1 text-sm text-foreground">{report.agentSummary.nextAction}</p>
            </div>
          </div>

          <ShareActions
            text={[
              `Sintesi interna — ${propertyRef}`,
              "",
              "Punti chiave:",
              ...report.agentSummary.keyPoints.map((point) => `- ${point}`),
              ...(report.agentSummary.objections.length > 0
                ? ["", "Obiezioni:", ...report.agentSummary.objections.map((item) => `- ${item}`)]
                : []),
              ...(report.agentSummary.technicalFeedback.length > 0
                ? ["", "Feedback tecnico:", ...report.agentSummary.technicalFeedback.map((item) => `- ${item}`)]
                : []),
              "",
              `Prossima azione: ${report.agentSummary.nextAction}`,
            ].join("\n")}
            copyLabel="Copia sintesi"
            className="mt-4"
          />
        </section>
      )}

      {locked && (
        <UpgradeLimitModal
          feature="voice-reports"
          reason={locked.reason}
          requiredPlan={locked.requiredPlan}
          onNavigateAway={() => setLocked(null)}
        />
      )}
    </div>
  );
}
