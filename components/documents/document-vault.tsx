"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DocumentCategory } from "@prisma/client";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Download,
  FolderOpen,
  Loader2,
  Lock,
  Paperclip,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { UpgradeLimitModal } from "@/components/billing/upgrade-limit-modal";
import {
  buildChecklist,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  expiryInfo,
  formatDate,
  formatFileSize,
  hasExpiry,
  LEAD_CHECKLIST,
  MAX_FILE_BYTES,
  PROPERTY_CHECKLIST,
} from "@/lib/documents/vault";
import { cn } from "@/lib/utils";

interface DocumentView {
  id: string;
  title: string;
  category: DocumentCategory;
  notes: string | null;
  expiresAt: string | null;
  retentionUntil: string;
  fileName: string | null;
  fileSize: number | null;
  hasFile: boolean;
  createdAt: string;
  uploadedByName: string | null;
}

interface DocumentVaultProps {
  /** Il fascicolo è di un immobile oppure di un cliente, mai di entrambi. */
  scope: "property" | "lead";
  scopeId: string;
  /** Nome mostrato in intestazione: "Fascicolo di Rif. A12" o del cliente. */
  scopeLabel: string;
  /**
   * `false` quando chi ospita il pannello mostra già il titolo — come la
   * sezione richiudibile nel portafoglio immobili, dove due intestazioni
   * identiche una sopra l'altra sarebbero solo rumore.
   */
  showTitle?: boolean;
}

/**
 * Fascicolo documentale di un immobile o di un cliente.
 *
 * Il valore non è l'archivio in sé — quello ce l'hanno già su una cartella —
 * ma le due cose che una cartella non fa: dire cosa manca prima del rogito e
 * avvisare quando un APE sta per scadere.
 */
export function DocumentVault({
  scope,
  scopeId,
  scopeLabel,
  showTitle = true,
}: DocumentVaultProps) {
  const [documents, setDocuments] = useState<DocumentView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Due stati distinti per la stessa 402, e la distinzione conta.
  //
  // `isLockedInline` nasce dall'apertura della scheda: chi è in prova sta solo
  // guardando un lead, e sbattergli davanti un paywall non chiudibile (che per
  // specifica non ha X, né Escape, né click fuori) lo intrappolerebbe in una
  // pagina che non aveva chiesto. Lì basta un riquadro che spiega.
  //
  // `isLockedModal` nasce dal tentativo di salvare un documento: lì l'azione è
  // voluta, è stata bloccata, e il modale è la risposta giusta.
  const [isLockedInline, setIsLockedInline] = useState(false);
  const [isLockedModal, setIsLockedModal] = useState(false);
  const [requiredPlan, setRequiredPlan] = useState<string | undefined>();
  const [isFormOpen, setIsFormOpen] = useState(false);

  const query = scope === "property" ? `propertyId=${scopeId}` : `leadId=${scopeId}`;

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/documents?${query}`);

      if (response.status === 402) {
        const payload = await response.json().catch(() => null);
        setRequiredPlan(payload?.requiredPlan);
        setIsLockedInline(true);
        return;
      }

      if (!response.ok) {
        setError("Non è stato possibile caricare il fascicolo.");
        return;
      }

      const payload = (await response.json()) as { documents: DocumentView[] };
      setDocuments(payload.documents);
    } catch {
      setError("Errore di rete: riprova fra poco.");
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLockedInline) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Fascicolo documentale
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Archivia mandato, visura, planimetria e APE nella scheda, con l&apos;avviso prima che
          scadano e la conservazione decennale già impostata. È incluso dal piano{" "}
          {requiredPlan ?? "Starter"} in su.
        </p>
        <Link
          href="/settings?tab=billing"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          Vedi i piani
          <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  const checklist = buildChecklist(
    scope === "property" ? PROPERTY_CHECKLIST : LEAD_CHECKLIST,
    documents.map((doc) => doc.category)
  );
  const missing = checklist.filter((entry) => !entry.present);
  const now = new Date();
  const alerts = documents.filter((doc) => {
    const info = expiryInfo(doc.expiresAt ? new Date(doc.expiresAt) : null, now);
    return info.state === "expired" || info.state === "expiring";
  });

  return (
    <div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          showTitle ? "justify-between" : "justify-end"
        )}
      >
        {showTitle && (
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
            Fascicolo documentale
          </h3>
        )}

        <button
          type="button"
          onClick={() => setIsFormOpen((open) => !open)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
        >
          {isFormOpen ? (
            <>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Annulla
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Aggiungi documento
            </>
          )}
        </button>
      </div>

      {/* Cosa manca: è la ragione per cui questa sezione esiste, quindi sta
          in alto e non in fondo all'elenco dei file già caricati. */}
      {!isLoading && missing.length > 0 && (
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs font-medium text-foreground">
            {missing.length === 1 ? "Manca un documento" : `Mancano ${missing.length} documenti`}
          </p>
          <ul className="mt-2 space-y-1">
            {checklist.map((entry) => (
              <li
                key={entry.category}
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  entry.present ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {entry.present ? (
                  <CheckCircle2
                    className="h-3.5 w-3.5 shrink-0 text-status-qualified"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                )}
                <span className={cn(entry.present && "line-through")}>{entry.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="mt-3 rounded-lg border border-status-blocked/40 bg-status-blocked/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-status-blocked">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {alerts.length === 1 ? "Un documento richiede attenzione" : "Documenti in scadenza"}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {alerts.map((doc) => (
              <li key={doc.id} className="text-xs text-foreground">
                {doc.title} —{" "}
                {expiryInfo(doc.expiresAt ? new Date(doc.expiresAt) : null, now).label.toLowerCase()}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isFormOpen && (
        <DocumentForm
          scope={scope}
          scopeId={scopeId}
          scopeLabel={scopeLabel}
          onCancel={() => setIsFormOpen(false)}
          onSaved={() => {
            setIsFormOpen(false);
            void load();
          }}
          onLocked={(plan) => {
            setRequiredPlan(plan);
            setIsLockedModal(true);
          }}
        />
      )}

      {isLockedModal && (
        <UpgradeLimitModal
          feature="document-vault"
          reason="not_in_plan"
          requiredPlan={requiredPlan}
          onNavigateAway={() => setIsLockedModal(false)}
        />
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-status-blocked">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carico il fascicolo…
        </p>
      ) : documents.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-border p-5 text-center">
          <p className="text-sm font-medium text-foreground">Fascicolo ancora vuoto</p>
          <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted-foreground">
            Archivia visura, planimetria, APE e mandato: li ritrovi qui alla prossima trattativa e
            ti avvisiamo <span className="font-medium">60 giorni prima</span> che scadano, in tempo
            per rifarli.
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {documents.map((doc) => (
            <DocumentRow key={doc.id} document={doc} now={now} onDeleted={load} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocumentRow({
  document: doc,
  now,
  onDeleted,
}: {
  document: DocumentView;
  now: Date;
  onDeleted: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const info = expiryInfo(doc.expiresAt ? new Date(doc.expiresAt) : null, now);

  async function remove(confirmed: boolean) {
    setIsDeleting(true);

    try {
      const response = await fetch(
        `/api/documents/${doc.id}${confirmed ? "?confirm=true" : ""}`,
        { method: "DELETE" }
      );

      // 409: il termine di conservazione non è ancora passato. Non è un
      // errore, è una domanda — l'agente decide e la richiesta si ripete.
      if (response.status === 409) {
        const payload = await response.json().catch(() => null);
        setConfirmMessage(payload?.message ?? "Documento ancora in conservazione. Confermi?");
        return;
      }

      if (response.ok) onDeleted();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{doc.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {DOCUMENT_CATEGORY_LABELS[doc.category]}
            {doc.fileSize !== null && ` · ${formatFileSize(doc.fileSize)}`}
            {doc.uploadedByName && ` · ${doc.uploadedByName}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {doc.hasFile && (
            <a
              href={`/api/documents/${doc.id}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-all duration-200 hover:bg-muted"
              aria-label={`Scarica ${doc.title}`}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
          <button
            type="button"
            onClick={() => void remove(false)}
            disabled={isDeleting}
            aria-label={`Elimina ${doc.title}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-all duration-200 hover:border-status-blocked/40 hover:text-status-blocked disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {doc.notes && <p className="mt-1.5 text-xs text-muted-foreground">{doc.notes}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {info.state !== "none" && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              info.state === "expired" && "bg-status-blocked/15 text-status-blocked",
              info.state === "expiring" && "bg-status-pending/15 text-status-pending",
              info.state === "valid" && "bg-status-qualified/15 text-status-qualified"
            )}
          >
            {info.label}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground">
          Conservazione fino al {formatDate(new Date(doc.retentionUntil))}
        </span>
      </div>

      {confirmMessage && (
        <div className="mt-2 rounded-lg border border-status-blocked/40 bg-status-blocked/5 p-2.5">
          <p className="text-xs text-foreground">{confirmMessage}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void remove(true)}
              className="rounded-md bg-status-blocked px-2.5 py-1 text-xs font-medium text-white transition-opacity duration-200 hover:opacity-90"
            >
              Elimina comunque
            </button>
            <button
              type="button"
              onClick={() => setConfirmMessage(null)}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-all duration-200 hover:bg-muted"
            >
              Annulla
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function DocumentForm({
  scope,
  scopeId,
  scopeLabel,
  onCancel,
  onSaved,
  onLocked,
}: {
  scope: "property" | "lead";
  scopeId: string;
  scopeLabel: string;
  onCancel: () => void;
  onSaved: () => void;
  onLocked: (requiredPlan?: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocumentCategory>(
    scope === "property" ? "VISURA_CATASTALE" : "IDENTITA"
  );
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<{ dataUrl: string; name: string; size: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;

    setError(null);

    // Il tetto si verifica qui e di nuovo sul server: qui per non far
    // aspettare l'agente il caricamento di un file che verrà rifiutato,
    // sul server perché il controllo del browser non è una garanzia.
    if (selected.size > MAX_FILE_BYTES) {
      setError(`Il file supera ${formatFileSize(MAX_FILE_BYTES)}. Riduci la scansione e riprova.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFile({ dataUrl: String(reader.result), name: selected.name, size: selected.size });
      // Il nome del file è quasi sempre il titolo giusto: precompilarlo
      // risparmia la digitazione più noiosa del modulo.
      if (!title) setTitle(selected.name.replace(/\.[^.]+$/, ""));
    };
    reader.onerror = () => setError("Non è stato possibile leggere il file.");
    reader.readAsDataURL(selected);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category,
          notes: notes.trim() || undefined,
          // Mezzogiorno UTC: una data scelta come "31/12" non deve diventare
          // il 30 per il fuso di chi la legge.
          expiresAt: expiresAt ? new Date(`${expiresAt}T12:00:00Z`).toISOString() : null,
          fileDataUrl: file?.dataUrl ?? null,
          fileName: file?.name ?? null,
          fileSize: file?.size ?? null,
          ...(scope === "property" ? { propertyId: scopeId } : { leadId: scopeId }),
        }),
      });

      if (response.status === 402) {
        const payload = await response.json().catch(() => null);
        onLocked(payload?.requiredPlan);
        return;
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.message ?? "Salvataggio non riuscito.");
        return;
      }

      onSaved();
    } catch {
      setError("Errore di rete: riprova fra poco.");
    } finally {
      setIsSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/30";

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">
        Il documento finisce nel fascicolo di <span className="font-medium">{scopeLabel}</span>.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="doc-title" className="text-xs font-medium text-foreground">
            Nome del documento
          </label>
          <input
            id="doc-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={160}
            placeholder="Visura catastale — foglio 12"
            className={cn(inputClass, "mt-1")}
          />
        </div>

        <div>
          <label htmlFor="doc-category" className="text-xs font-medium text-foreground">
            Tipo
          </label>
          <select
            id="doc-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as DocumentCategory)}
            className={cn(inputClass, "mt-1")}
          >
            {DOCUMENT_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {DOCUMENT_CATEGORY_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        {/* Il campo scadenza compare solo per i documenti che scadono
            davvero: chiederla per un atto di provenienza la farebbe
            compilare a caso. */}
        {hasExpiry(category) && (
          <div>
            <label htmlFor="doc-expires" className="text-xs font-medium text-foreground">
              Scadenza <span className="text-muted-foreground">(facoltativa)</span>
            </label>
            <input
              id="doc-expires"
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className={cn(inputClass, "mt-1")}
            />
          </div>
        )}

        <div className="sm:col-span-2">
          <label htmlFor="doc-file" className="text-xs font-medium text-foreground">
            File <span className="text-muted-foreground">(facoltativo, PDF o immagine)</span>
          </label>
          <input
            id="doc-file"
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={handleFile}
            className={cn(inputClass, "mt-1 file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:text-foreground")}
          />
          {file && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Paperclip className="h-3 w-3 shrink-0" aria-hidden="true" />
              {file.name} · {formatFileSize(file.size)}
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="doc-notes" className="text-xs font-medium text-foreground">
            Note <span className="text-muted-foreground">(facoltative)</span>
          </label>
          <textarea
            id="doc-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            maxLength={1000}
            className={cn(inputClass, "mt-1 resize-y")}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-status-blocked">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={isSaving || title.trim().length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gradient px-3 py-2 text-xs font-semibold text-white transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
        >
          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          Salva nel fascicolo
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all duration-200 hover:bg-muted"
        >
          Annulla
        </button>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Conservazione decennale automatica, come previsto per i soggetti obbligati dal D.Lgs.
        231/2007. Il fascicolo è uno strumento di supporto: la valutazione del rischio e le
        segnalazioni restano in capo all&apos;agenzia.
      </p>
    </form>
  );
}
