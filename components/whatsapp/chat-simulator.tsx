"use client";

import { useEffect, useRef, useState } from "react";
import { FlaskConical, Loader2, RotateCcw, Send } from "lucide-react";
import { QUALIFICATION_QUESTIONS } from "@/lib/whatsapp/questions";
import { buildOpeningMessage } from "@/lib/whatsapp/compliance";
import type { ChatMessage } from "@/lib/whatsapp/types";
import { cn } from "@/lib/utils";

const DEMO_CLIENT = "Mario Rossi";
const DEMO_PROPERTY = "Rif. A102 — Trilocale Via Roma 12";

interface ExtractedFields {
  mortgageApproved: boolean | null;
  mustSellFirst: boolean | null;
  timeframe: string | null;
  budget: string | null;
}

const OUTCOME_STYLES: Record<string, string> = {
  QUALIFIED: "bg-status-qualified/10 text-status-qualified",
  UNQUALIFIED: "bg-status-blocked/10 text-status-blocked",
  OPT_OUT: "bg-status-blocked/10 text-status-blocked",
  CONTINUE: "bg-status-pending/10 text-status-pending",
};

const OUTCOME_LABELS: Record<string, string> = {
  QUALIFIED: "Qualificato",
  UNQUALIFIED: "Non qualificato",
  OPT_OUT: "Opt-out",
  CONTINUE: "Qualificazione in corso",
};

function openingMessage(agencyName: string): ChatMessage {
  return {
    sender: "bot",
    text: buildOpeningMessage(
      DEMO_CLIENT,
      DEMO_PROPERTY,
      agencyName,
      QUALIFICATION_QUESTIONS.mortgage
    ),
    timestamp: new Date().toISOString(),
  };
}

export function ChatSimulator({ agencyName = "la tua agenzia" }: { agencyName?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [openingMessage(agencyName)]);
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [outcome, setOutcome] = useState<string>("CONTINUE");
  const [extracted, setExtracted] = useState<ExtractedFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isThinking]);

  async function send() {
    const text = draft.trim();
    if (!text || isThinking) return;

    const history: ChatMessage[] = [
      ...messages,
      { sender: "user", text, timestamp: new Date().toISOString() },
    ];

    setMessages(history);
    setDraft("");
    setError(null);
    setIsThinking(true);

    try {
      const response = await fetch("/api/whatsapp/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: DEMO_CLIENT, propertyRef: DEMO_PROPERTY, history }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "L'assistente non ha risposto. Riprova.");
        return;
      }

      setMessages((current) => [
        ...current,
        { sender: "bot", text: body.reply as string, timestamp: new Date().toISOString() },
      ]);
      setOutcome(body.outcome as string);
      setExtracted((body.extracted as ExtractedFields | null) ?? null);
    } catch {
      setError("Errore di rete durante la simulazione.");
    } finally {
      setIsThinking(false);
    }
  }

  function reset() {
    setMessages([openingMessage(agencyName)]);
    setDraft("");
    setOutcome("CONTINUE");
    setExtracted(null);
    setError(null);
  }

  return (
    <section className="card-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FlaskConical className="h-4 w-4 text-primary" />
            Testa l&apos;AI
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Scrivi come farebbe un cliente e vedi la risposta dell&apos;assistente. Nessun messaggio
            WhatsApp viene inviato e nessun credito viene consumato.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Ricomincia
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-2.5 py-1">Cliente simulato: {DEMO_CLIENT}</span>
        <span className="rounded-full bg-muted px-2.5 py-1">{DEMO_PROPERTY}</span>
        <span className={cn("rounded-full px-2.5 py-1 font-medium", OUTCOME_STYLES[outcome])}>
          {OUTCOME_LABELS[outcome]}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="mt-4 max-h-80 space-y-3 overflow-y-auto rounded-xl border border-border bg-muted/30 p-4"
      >
        {messages.map((message, index) => (
          <div
            key={index}
            className={cn("flex", message.sender === "bot" ? "justify-start" : "justify-end")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2",
                message.sender === "bot"
                  ? "bg-card text-foreground shadow-sm"
                  : "bg-brand-gradient text-white"
              )}
            >
              <p className="whitespace-pre-wrap text-sm">{message.text}</p>
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              L&apos;assistente sta scrivendo…
            </div>
          </div>
        )}
      </div>

      {extracted && (
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {(
            [
              ["Mutuo/liquidità", extracted.mortgageApproved === null ? "—" : extracted.mortgageApproved ? "Sì" : "No"],
              ["Deve vendere", extracted.mustSellFirst === null ? "—" : extracted.mustSellFirst ? "Sì" : "No"],
              ["Tempistica", extracted.timeframe ?? "—"],
              ["Budget", extracted.budget ?? "—"],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border p-2.5">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="truncate text-sm font-medium text-foreground">{value}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-status-blocked">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Rispondi come farebbe il cliente…"
          aria-label="Messaggio di prova"
          className="input-field flex-1"
        />
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim() || isThinking}
          aria-label="Invia messaggio di prova"
          className="btn-brand shrink-0 px-4"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
