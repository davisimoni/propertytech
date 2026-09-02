"use client";

import { useEffect, useRef, useState } from "react";
import { FlaskConical, Loader2, MessageSquarePlus, RotateCcw, Send, ShieldAlert } from "lucide-react";
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
  preferredZone?: string | null;
}

interface IntentVerdict {
  pertinente: boolean;
  nuovaRichiesta: boolean;
  motivo: string;
}

/**
 * Esempio precaricato: una richiesta formale come quelle inoltrate dai
 * portali.
 *
 * E' il formato su cui e' piu' facile avere dubbi — sembra un messaggio
 * automatico — ed e' quindi quello che vale la pena poter provare con un
 * clic invece di riscriverlo a mano ogni volta.
 */
const ESEMPIO_FORMALE =
  "Gentile Agenzia, vi contatto perché sono alla ricerca di un immobile a Vignola, preferibilmente una villa indipendente con giardino. Il mio budget è di circa 300.000€. Resto in attesa di un vostro riscontro. Cordiali saluti.";

const OUTCOME_STYLES: Record<string, string> = {
  QUALIFIED: "bg-status-qualified/10 text-status-qualified",
  UNQUALIFIED: "bg-status-blocked/10 text-status-blocked",
  OPT_OUT: "bg-status-blocked/10 text-status-blocked",
  CONTINUE: "bg-status-pending/10 text-status-pending",
  OFF_TOPIC: "bg-muted text-muted-foreground",
};

const OUTCOME_LABELS: Record<string, string> = {
  QUALIFIED: "Qualificato",
  UNQUALIFIED: "Non qualificato",
  OPT_OUT: "Opt-out",
  CONTINUE: "Qualificazione in corso",
  OFF_TOPIC: "Ignorato dal filtro",
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
  /**
   * Primo contatto: la conversazione parte vuota e il primo messaggio è
   * quello del cliente.
   *
   * È la modalità che serve quando un lead non è comparso in pipeline: si
   * incolla il messaggio davvero ricevuto e si vede se sarebbe stato
   * raccolto. Nell'altra modalità si parte dall'apertura dell'agenzia e si
   * prova come l'assistente conduce la qualificazione: due domande diverse.
   */
  const [firstContact, setFirstContact] = useState(false);
  const [intent, setIntent] = useState<IntentVerdict | null>(null);
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
        body: JSON.stringify({
          clientName: DEMO_CLIENT,
          propertyRef: DEMO_PROPERTY,
          history,
          firstContact,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "L'assistente non ha risposto. Riprova.");
        return;
      }

      setIntent((body.intent as IntentVerdict | null) ?? null);
      setOutcome(body.outcome as string);
      setExtracted((body.extracted as ExtractedFields | null) ?? null);

      // Messaggio scartato dal filtro: in produzione l'assistente resta zitto,
      // e qui si mostra lo stesso silenzio invece di inventare una risposta.
      // Il motivo compare nel riquadro del verdetto.
      if (body.ignored) return;

      setMessages((current) => [
        ...current,
        { sender: "bot", text: body.reply as string, timestamp: new Date().toISOString() },
      ]);
    } catch {
      setError("Errore di rete durante la simulazione.");
    } finally {
      setIsThinking(false);
    }
  }

  function reset(modalitaPrimoContatto = firstContact) {
    setFirstContact(modalitaPrimoContatto);
    // In modalità primo contatto la chat parte vuota: il primo messaggio deve
    // essere quello del cliente, o non si sta provando un primo contatto.
    setMessages(modalitaPrimoContatto ? [] : [openingMessage(agencyName)]);
    setDraft("");
    setOutcome("CONTINUE");
    setExtracted(null);
    setIntent(null);
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
            {firstContact
              ? "Incolla il messaggio che un contatto ha davvero inviato e verifica se sarebbe stato raccolto: il filtro di pertinenza è lo stesso della produzione."
              : "Scrivi come farebbe un cliente e vedi la risposta dell'assistente."}{" "}
            Nessun messaggio WhatsApp viene inviato e nessun credito viene consumato.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Le due modalità rispondono a domande diverse, quindi cambiare
              modalità azzera la conversazione: proseguire quella in corso con
              regole diverse darebbe un risultato che non vale per nessuna
              delle due. */}
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {[
              { valore: false, etichetta: "Qualificazione" },
              { valore: true, etichetta: "Primo contatto" },
            ].map((modo) => (
              <button
                key={String(modo.valore)}
                type="button"
                onClick={() => reset(modo.valore)}
                aria-pressed={firstContact === modo.valore}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200",
                  firstContact === modo.valore
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {modo.etichetta}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setDraft(ESEMPIO_FORMALE)}
            className="inline-flex h-10 items-center sm:h-8 gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Esempio formale
          </button>

          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-10 items-center sm:h-8 gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Ricomincia
          </button>
        </div>
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
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nessun messaggio. Scrivi qui sotto il primo messaggio del contatto, come lo hai
            ricevuto.
          </p>
        )}
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

      {intent && (
        <div
          className={cn(
            "mt-3 flex items-start gap-2.5 rounded-lg border p-3 text-sm",
            intent.pertinente
              ? "border-status-qualified/30 bg-status-qualified/5"
              : "border-status-blocked/30 bg-status-blocked/5"
          )}
        >
          <ShieldAlert
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              intent.pertinente ? "text-status-qualified" : "text-status-blocked"
            )}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="font-medium text-foreground">
              {intent.pertinente
                ? "Il filtro lo riconosce come richiesta immobiliare"
                : "Il filtro lo scarta: l'assistente non risponderebbe"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Motivo registrato: {intent.motivo}
              {intent.pertinente && intent.nuovaRichiesta
                ? " · riaprirebbe una pratica già chiusa"
                : ""}
            </p>
            {!intent.pertinente && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                In produzione nessuna scheda verrebbe creata e nessun credito consumato: è il
                comportamento previsto per i messaggi personali e la pubblicità.
              </p>
            )}
          </div>
        </div>
      )}

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
          placeholder={
            firstContact && messages.length === 0
              ? "Incolla qui il messaggio ricevuto…"
              : "Rispondi come farebbe il cliente…"
          }
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
