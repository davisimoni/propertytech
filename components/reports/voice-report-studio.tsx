"use client";

import { useRef, useState, type DragEvent } from "react";
import { Check, FileAudio, Loader2, Printer, Send, Sparkles, X } from "lucide-react";
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
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const [report, setReport] = useState<VoiceReportContent | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  function acceptAudio(file: File) {
    if (file.size > MAX_AUDIO_BYTES) {
      setError("Il file audio supera i 25MB.");
      return;
    }
    setError(null);
    setAudioFile(file);
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
        mode === "audio" && audioFile
          ? await (() => {
              const formData = new FormData();
              formData.append("audio", audioFile);
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
        setLocked(true);
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
    (mode === "audio" ? Boolean(audioFile) : notes.trim().length >= 20);

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
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
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
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
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
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
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
              onRecorded={(file) => {
                setAudioFile(file);
                setError(null);
              }}
              onCleared={() => setAudioFile(null)}
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
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200",
                isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
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
              <p className="text-sm text-foreground">
                Oppure trascina qui un file audio (MP3, WAV, M4A)
              </p>
              <p className="text-xs text-muted-foreground">Massimo 25MB</p>
            </div>

            {audioFile && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <span className="truncate text-sm text-foreground">{audioFile.name}</span>
                <button
                  type="button"
                  onClick={() => setAudioFile(null)}
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
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
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
          {isGenerating ? "Generazione report in corso…" : "Genera report per il proprietario"}
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

      {locked && (
        <UpgradeLimitModal
          feature="voice-reports"
          reason="not_in_plan"
          onNavigateAway={() => setLocked(false)}
        />
      )}
    </div>
  );
}
