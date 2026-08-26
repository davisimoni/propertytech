"use client";

import { useRef, useState, type DragEvent } from "react";
import {
  AlertTriangle,
  Check,
  Clipboard,
  Download,
  FileUp,
  Loader2,
  Printer,
  Sparkles,
  X,
} from "lucide-react";
import { UpgradeLimitModal } from "@/components/billing/upgrade-limit-modal";
import { ShareActions } from "@/components/shared/share-actions";
import { AiDisclaimer } from "@/components/shared/ai-disclaimer";
import { ExtractionDocument } from "@/lib/pdf/extraction-document";
import { extractionFileName } from "@/lib/pdf/file-name";
import { DownloadPdfButton } from "@/components/shared/download-pdf-button";
import { DOCUMENT_PROGRESS, ProgressMessages } from "@/components/shared/progress-messages";
import { cn } from "@/lib/utils";
import {
  AMBITI_DOCUMENTO,
  AMBITO_LABELS,
  DIRITTI_REALI,
  DIRITTO_REALE_LABELS,
  DOCUMENT_TYPE_LABELS,
  type CriticitaLivello,
  type DirittoReale,
  type DocumentExtractionResult,
} from "@/lib/ai/document-schema";

type Status = "idle" | "uploading" | "success" | "error";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function DocumentExtractor() {
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<DocumentExtractionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setErrorMessage(null);

    if (!isPdfFile(file)) {
      setErrorMessage("Formato non supportato: carica un file PDF.");
      setStatus("error");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage("Il file supera la dimensione massima di 15MB.");
      setStatus("error");
      return;
    }

    setFileName(file.name);
    setStatus("uploading");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/documents/extract", {
        method: "POST",
        body: formData,
      });

      if (response.status === 402) {
        setStatus("idle");
        setShowUpgradeModal(true);
        return;
      }

      const body = await response.json();

      if (!response.ok) {
        setErrorMessage(body.message ?? "Analisi non riuscita. Riprova.");
        setStatus("error");
        return;
      }

      setResult(body.extraction as DocumentExtractionResult);
      setStatus("success");
    } catch {
      setErrorMessage("Errore di rete durante l'analisi del documento.");
      setStatus("error");
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function reset() {
    setStatus("idle");
    setFileName(null);
    setResult(null);
    setErrorMessage(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName?.replace(/\.pdf$/i, "") ?? "estrazione"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (status === "success" && result) {
    return (
      <div>
        <ExtractionResultView
          result={result}
          onChange={setResult}
          onCopy={handleCopy}
          onDownloadJson={handleDownloadJson}
          copied={copied}
          onReset={reset}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={handleDrop}
        onClick={() => status !== "uploading" && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 text-center transition-colors",
          status === "uploading" ? "cursor-default border-border" : "cursor-pointer border-border hover:border-primary/50",
          isDragActive && "border-primary bg-primary/5"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        {status === "uploading" ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div>
              <ProgressMessages
                messages={DOCUMENT_PROGRESS}
                showSpinner={false}
                className="text-sm font-medium text-foreground"
              />
              <p className="mt-1 text-sm text-muted-foreground">{fileName}</p>
            </div>
          </>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Trascina qui la visura in PDF, o clicca per selezionarla
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                L&apos;AI estrae intestatari, quote di proprietà, foglio, particella, subalterno,
                categoria e rendita, e ti segnala cosa manca o non torna.
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Visura Catastale, Planimetria, Atto di Provenienza o APE — solo PDF, max 15 MB
              </p>
                {/* Il caso in cui l'estrazione riesce peggio è la scansione
                    storta o sbiadita: dirlo prima evita che l'agente pensi
                    che lo strumento non funzioni. */}
                <p className="mt-1 text-xs text-muted-foreground">
                  Va bene anche una scansione, purché dritta e leggibile: sui documenti sbiaditi
                  qualche campo può restare vuoto e va completato a mano.
                </p>
            </div>
          </>
        )}
      </div>

      {status === "error" && errorMessage && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-status-blocked/30 bg-status-blocked/10 px-4 py-3 text-sm text-status-blocked">
          <span>{errorMessage}</span>
          <button type="button" onClick={reset} aria-label="Chiudi" className="text-status-blocked hover:opacity-70">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showUpgradeModal && (
        <UpgradeLimitModal feature="documents" onNavigateAway={() => setShowUpgradeModal(false)} />
      )}
    </div>
  );
}

function LabeledField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}

interface ExtractionResultViewProps {
  result: DocumentExtractionResult;
  onChange: (result: DocumentExtractionResult) => void;
  onCopy: () => void;
  onDownloadJson: () => void;
  copied: boolean;
  onReset: () => void;
}

const CRITICITA_STYLES: Record<CriticitaLivello, { box: string; label: string }> = {
  alta: { box: "border-status-blocked/30 bg-status-blocked/10", label: "text-status-blocked" },
  media: { box: "border-status-pending/30 bg-status-pending/10", label: "text-status-pending" },
  informativa: { box: "border-border bg-muted/40", label: "text-muted-foreground" },
};

const CRITICITA_LABELS: Record<CriticitaLivello, string> = {
  alta: "Da verificare",
  media: "Attenzione",
  informativa: "Nota",
};

/**
 * Criticità rilevate nel documento.
 *
 * Compare **solo se c'è qualcosa da dire**: una sezione sempre presente che
 * per lo più recita "nessun rilievo" aggiungerebbe rumore a ogni estrazione
 * e finirebbe per essere saltata proprio quando conta.
 *
 * Il tono è descrittivo e non prescrittivo — "da verificare", non "immobile
 * non vendibile". Il prodotto non certifica nulla: segnala un fatto e lascia
 * la valutazione al professionista, coerentemente con quanto vale per il
 * Fascicolo documentale (CLAUDE.md).
 *
 * `?? []` non è difensivismo inutile: le estrazioni salvate prima
 * dell'introduzione di questo campo non lo contengono, e rileggerle dalla
 * cronologia farebbe altrimenti fallire il rendering.
 */
function CriticitaList({ criticita }: { criticita?: DocumentExtractionResult["criticita"] }) {
  const items = criticita ?? [];
  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <AlertTriangle className="h-4 w-4 text-status-pending" />
        Elementi da verificare
      </h3>
      <ul className="mt-2 space-y-2">
        {items.map((item, index) => {
          const style = CRITICITA_STYLES[item.livello] ?? CRITICITA_STYLES.informativa;
          return (
            <li key={index} className={cn("rounded-lg border p-3", style.box)}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("text-xs font-semibold uppercase tracking-wide", style.label)}>
                  {CRITICITA_LABELS[item.livello] ?? "Nota"}
                </span>
                <span className="text-sm font-medium text-foreground">{item.titolo}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{item.dettaglio}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Segnalazioni automatiche a supporto della verifica: non sostituiscono il controllo del
        professionista.
      </p>
    </div>
  );
}

/** Sezione mostrata solo quando ha contenuto, per non allungare le estrazioni scarne. */
function DetailSection({
  title,
  children,
  isEmpty,
}: {
  title: string;
  children: React.ReactNode;
  isEmpty: boolean;
}) {
  if (isEmpty) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}

function ExtractionResultView({
  result,
  onChange,
  onCopy,
  onDownloadJson,
  copied,
  onReset,
}: ExtractionResultViewProps) {
  return (
    <div className="space-y-4">
      <div id="extraction-print-area" className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {DOCUMENT_TYPE_LABELS[result.tipoDocumento]}
            </span>
          </div>
          {result.noteVincoli.presenti && (
            <span className="inline-flex items-center rounded-full bg-status-pending/10 px-2.5 py-1 text-xs font-medium text-status-pending">
              Note/vincoli presenti
            </span>
          )}
        </div>

        {/* Sintesi in cima: è la prima cosa che l'agente legge, prima di
            scendere nelle tabelle catastali. */}
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Sintesi per l&apos;Agente
            </h3>
            <ShareActions
              text={result.sintesiAgente}
              copyLabel="Copia sintesi"
              className="print:hidden"
            />
          </div>
          <p className="mt-2 text-sm text-foreground">{result.sintesiAgente}</p>
        </div>

        <CriticitaList criticita={result.criticita} />

        <div>
          <h3 className="text-sm font-semibold text-foreground">Dati Immobile</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <LabeledField
              label="Comune"
              value={result.datiImmobile.comune ?? ""}
              onChange={(value) => onChange({ ...result, datiImmobile: { ...result.datiImmobile, comune: value } })}
            />
            <LabeledField
              label="Indirizzo"
              value={result.datiImmobile.indirizzo ?? ""}
              onChange={(value) => onChange({ ...result, datiImmobile: { ...result.datiImmobile, indirizzo: value } })}
            />
            <LabeledField
              label="Foglio"
              value={result.datiImmobile.foglio ?? ""}
              onChange={(value) => onChange({ ...result, datiImmobile: { ...result.datiImmobile, foglio: value } })}
            />
            <LabeledField
              label="Particella / Mappale"
              value={result.datiImmobile.particella ?? ""}
              onChange={(value) => onChange({ ...result, datiImmobile: { ...result.datiImmobile, particella: value } })}
            />
            <LabeledField
              label="Subalterno"
              value={result.datiImmobile.subalterno ?? ""}
              onChange={(value) => onChange({ ...result, datiImmobile: { ...result.datiImmobile, subalterno: value } })}
            />
            <LabeledField
              label="Categoria Catastale"
              value={result.datiImmobile.categoriaCatastale ?? ""}
              onChange={(value) =>
                onChange({ ...result, datiImmobile: { ...result.datiImmobile, categoriaCatastale: value } })
              }
            />
            <LabeledField
              label="Classe"
              value={result.datiImmobile.classeCatastale ?? ""}
              onChange={(value) =>
                onChange({ ...result, datiImmobile: { ...result.datiImmobile, classeCatastale: value } })
              }
            />
            <LabeledField
              label="Consistenza"
              value={result.datiImmobile.consistenza ?? ""}
              onChange={(value) =>
                onChange({ ...result, datiImmobile: { ...result.datiImmobile, consistenza: value } })
              }
            />
            <LabeledField
              label="Rendita Catastale"
              value={result.datiImmobile.renditaCatastale ?? ""}
              onChange={(value) =>
                onChange({ ...result, datiImmobile: { ...result.datiImmobile, renditaCatastale: value } })
              }
            />
            <LabeledField
              label="Superficie Catastale"
              value={result.datiImmobile.superficieCatastale ?? ""}
              onChange={(value) =>
                onChange({ ...result, datiImmobile: { ...result.datiImmobile, superficieCatastale: value } })
              }
            />
          </div>
          {/* La distinzione che gli agenti chiedono più spesso: la superficie
              catastale non è quella commerciale su cui si calcola il €/m². */}
          {result.datiImmobile.superficieCatastale && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              La superficie catastale segue criteri propri e può non coincidere con la superficie
              commerciale usata in valutazione.
            </p>
          )}
        </div>

        <DetailSection
          title="Pertinenze"
          isEmpty={(result.pertinenze ?? []).length === 0}
        >
          <ul className="space-y-1.5">
            {(result.pertinenze ?? []).map((pertinenza, index) => (
              <li
                key={index}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5 text-sm"
              >
                <span className="font-medium text-foreground">{pertinenza.descrizione}</span>
                {pertinenza.categoriaCatastale && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {pertinenza.categoriaCatastale}
                  </span>
                )}
                {pertinenza.subalterno && (
                  <span className="text-xs text-muted-foreground">sub. {pertinenza.subalterno}</span>
                )}
              </li>
            ))}
          </ul>
        </DetailSection>

        {/* Un solo array raggruppato per ambito: a schermo restituisce le
            stesse sezioni di prima (provenienza, formalità, titoli edilizi,
            condominio), ma con una frazione del peso nello schema — vedi la
            nota sui limiti della grammatica in `lib/ai/document-schema.ts`. */}
        {AMBITI_DOCUMENTO.map((ambito) => {
          const voci = (result.altriDati ?? []).filter((item) => item.ambito === ambito);

          return (
            <DetailSection key={ambito} title={AMBITO_LABELS[ambito]} isEmpty={voci.length === 0}>
              {voci.map((voce, index) => (
                <div key={index} className="rounded-lg border border-border p-2.5 text-sm">
                  <span className="font-medium text-foreground">{voce.voce}</span>
                  {voce.dettaglio && (
                    <p className="mt-0.5 text-muted-foreground">{voce.dettaglio}</p>
                  )}
                </div>
              ))}
            </DetailSection>
          );
        })}

        <div>
          <h3 className="text-sm font-semibold text-foreground">Dati Anagrafici Proprietari</h3>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Nome e Cognome</th>
                  <th className="px-3 py-2 font-medium">Codice Fiscale</th>
                  <th className="px-3 py-2 font-medium">Quota</th>
                  {/* Il diritto reale risponde alla domanda "chi può vendere":
                      un nudo proprietario non dispone del pieno godimento
                      finché esiste l'usufrutto. */}
                  <th className="px-3 py-2 font-medium">Diritto</th>
                </tr>
              </thead>
              <tbody>
                {result.proprietari.map((proprietario, index) => (
                  <tr key={index} className="border-b border-border last:border-0">
                    <td className="p-2">
                      <input
                        type="text"
                        value={proprietario.nomeCognome}
                        onChange={(event) => {
                          const proprietari = [...result.proprietari];
                          proprietari[index] = { ...proprietario, nomeCognome: event.target.value };
                          onChange({ ...result, proprietari });
                        }}
                        className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={proprietario.codiceFiscale ?? ""}
                        onChange={(event) => {
                          const proprietari = [...result.proprietari];
                          proprietari[index] = { ...proprietario, codiceFiscale: event.target.value };
                          onChange({ ...result, proprietari });
                        }}
                        className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={proprietario.quotaProprieta ?? ""}
                        onChange={(event) => {
                          const proprietari = [...result.proprietari];
                          proprietari[index] = { ...proprietario, quotaProprieta: event.target.value };
                          onChange({ ...result, proprietari });
                        }}
                        className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
                      />
                    </td>
                    <td className="p-2">
                      <select
                        value={proprietario.dirittoReale ?? "non_specificato"}
                        onChange={(event) => {
                          const proprietari = [...result.proprietari];
                          proprietari[index] = {
                            ...proprietario,
                            dirittoReale: event.target.value as DirittoReale,
                          };
                          onChange({ ...result, proprietari });
                        }}
                        className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
                      >
                        {DIRITTI_REALI.map((diritto) => (
                          <option key={diritto} value={diritto}>
                            {DIRITTO_REALE_LABELS[diritto]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {result.proprietari.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-sm text-muted-foreground">
                      Nessun proprietario individuato nel documento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">Checklist Rapida</h3>
          <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={result.noteVincoli.presenti}
              onChange={(event) =>
                onChange({ ...result, noteVincoli: { ...result.noteVincoli, presenti: event.target.checked } })
              }
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            Note o vincoli particolari presenti nel documento
          </label>
          <textarea
            value={result.noteVincoli.dettagli ?? ""}
            onChange={(event) =>
              onChange({ ...result, noteVincoli: { ...result.noteVincoli, dettagli: event.target.value } })
            }
            rows={2}
            placeholder="Dettagli su eventuali note o vincoli…"
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Dentro l'area di stampa: il disclaimer accompagna anche il PDF esportato. */}
        <AiDisclaimer />
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
        >
          {copied ? <Check className="h-4 w-4 text-primary" /> : <Clipboard className="h-4 w-4" />}
          {copied ? "Copiato!" : "Copia negli appunti"}
        </button>
        <button
          type="button"
          onClick={onDownloadJson}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
        >
          <Download className="h-4 w-4" />
          Scarica JSON
        </button>
        <DownloadPdfButton
          buildDocument={(branding) => ExtractionDocument({ branding, result })}
          fileName={extractionFileName(result.datiImmobile)}
          label="Scarica Report PDF"
        />
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
        >
          <Printer className="h-4 w-4" />
          Stampa
        </button>
        <button
          type="button"
          onClick={onReset}
          className="ml-auto inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted"
        >
          Analizza un altro documento
        </button>
      </div>
    </div>
  );
}
