"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, NotebookPen, Send } from "lucide-react";

/**
 * Note interne dell'agenzia su un contatto.
 *
 * # Perché stanno accanto alla conversazione e non dentro
 *
 * La cronologia della chat è ciò che il cliente ha scritto e ricevuto: un
 * appunto interno mescolato lì, prima o poi, gli viene spedito. Separarli
 * visivamente non è pedanteria — è ciò che rende sicuro scrivere «il marito
 * non è convinto» in un riquadro che sta a due centimetri dai messaggi che
 * quella persona riceve davvero.
 *
 * # Perché le note non si modificano né si cancellano
 *
 * Una nota è un appunto datato, non un documento condiviso: serve a
 * ricostruire cosa si sapeva e quando. Poterla riscrivere a posteriori
 * toglierebbe proprio la garanzia per cui la si legge, e per un errore di
 * battitura basta scriverne un'altra.
 */

interface Note {
  id: string;
  content: string;
  authorName: string | null;
  createdAt: string;
}

const MAX_LUNGHEZZA = 2000;

function quando(iso: string): string {
  const data = new Date(iso);
  return data.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LeadNotesCard({ leadId }: { leadId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/whatsapp/leads/${leadId}/notes`);
      if (!response.ok) throw new Error();
      const data: { notes: Note[] } = await response.json();
      setNotes(data.notes);
      setError(null);
    } catch {
      setError("Non è stato possibile caricare le note.");
    } finally {
      setIsLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    setIsLoading(true);
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSaving) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/whatsapp/leads/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.message ?? "Nota non salvata. Riprova.");
        return;
      }

      // In cima, come le restituisce il server: la nota appena scritta è
      // quella che serve subito a chi la legge dopo.
      setNotes((current) => [data.note as Note, ...current]);
      setDraft("");
    } catch {
      setError("Errore di rete. La nota non è stata salvata.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <NotebookPen className="h-3.5 w-3.5" />
        Note interne
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Visibili solo alla tua agenzia. Non vengono mai inviate al cliente né lette
        dall&apos;assistente.
      </p>

      <form onSubmit={submit} className="mt-3">
        <label htmlFor={`nota-${leadId}`} className="sr-only">
          Nuova nota interna
        </label>
        <textarea
          id={`nota-${leadId}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Invio manda, Maiusc+Invio va a capo: una nota è quasi sempre una
            // riga, e costringere al mouse per salvarla la fa scrivere meno.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit(event as unknown as React.FormEvent);
            }
          }}
          rows={2}
          maxLength={MAX_LUNGHEZZA}
          placeholder="Es. Il marito non è convinto, richiamare dopo il 15."
          className="input-field w-full resize-y text-base sm:text-sm"
        />

        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {draft.length > MAX_LUNGHEZZA - 200 ? `${draft.length}/${MAX_LUNGHEZZA}` : ""}
          </span>
          <button
            type="submit"
            disabled={!draft.trim() || isSaving}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-gradient px-3 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Aggiungi nota
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="mt-2 text-xs text-status-blocked">
          {error}
        </p>
      )}

      <div className="mt-3 space-y-2">
        {isLoading && (
          <p className="text-xs text-muted-foreground">Caricamento delle note…</p>
        )}

        {!isLoading && notes.length === 0 && !error && (
          <p className="text-xs text-muted-foreground">
            Nessuna nota. La prima che scrivi qui è quella che un collega leggerà se dovrà
            prendere in mano questo contatto al posto tuo.
          </p>
        )}

        {notes.map((note) => (
          <article key={note.id} className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {note.content}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {/* L'autore può mancare se ha lasciato l'agenzia: la nota resta,
                  perché è la storia della trattativa. */}
              {note.authorName ?? "Collaboratore rimosso"} · {quando(note.createdAt)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
