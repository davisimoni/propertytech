"use client";

import { useEffect, useRef, useState } from "react";
import { Headset, Loader2, MessageCircle, Send, X } from "lucide-react";
import { RichText } from "@/components/support/rich-text";
import { BRAND } from "@/lib/brand";
import {
  MAX_QUESTION_LENGTH,
  SUPPORT_GREETING,
  SUPPORT_SUGGESTIONS,
  type SupportMessage,
} from "@/lib/support/knowledge";
import { cn } from "@/lib/utils";

/**
 * Assistente clienti: pulsante fluttuante e pannello di conversazione.
 *
 * Lo storico vive **solo qui**, nello stato del componente: il server non
 * conserva le conversazioni, e chi scrive può digitare il nome di un proprio
 * cliente senza che finisca nei nostri archivi.
 */

export function SupportWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function open() {
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // Chiusura con Escape: è quello che si prova per primo.
  useEffect(() => {
    if (!isOpen) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  // Scorrimento in fondo a ogni nuovo messaggio.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isSending]);

  async function send(question: string) {
    const text = question.trim();
    if (!text || isSending) return;

    setDraft("");
    setError(null);
    setIsSending(true);

    const history = messages;
    setMessages([...history, { role: "user", content: text }]);

    try {
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.message ?? "Non sono riuscito a rispondere. Riprova fra poco.");
        return;
      }

      setMessages((current) => [...current, { role: "assistant", content: data.answer as string }]);
    } catch {
      setError(`Errore di rete. Puoi scriverci a ${BRAND.supportEmail}.`);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      {/* --- Pulsante fluttuante e vignetta --- */}
      {!isOpen && (
        // `bottom-24` su mobile: la barra di navigazione inferiore è alta
        // circa 64px più la safe area, e a `bottom-5` il pulsante ci finiva
        // sopra coprendo la voce "Report". Da `sm` in su la barra non c'è e
        // il pulsante torna all'angolo.
        // Valore arbitrario Tailwind e non `style` inline: uno stile in linea
        // vincerebbe anche su `sm:bottom-5`, e il pulsante resterebbe sollevato
        // pure su desktop, dove la barra inferiore non esiste.
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-50 print:hidden sm:bottom-5 sm:right-5">
          <button
            type="button"
            onClick={open}
            aria-label="Apri l'assistenza PropertyTech"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2"
          >
            <MessageCircle className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* --- Pannello di conversazione --- */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Assistenza PropertyTech Solutions"
          className="fixed inset-x-0 bottom-0 z-[60] flex h-[85vh] flex-col overflow-hidden border border-border bg-card shadow-2xl print:hidden sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[32rem] sm:w-[24rem] sm:rounded-2xl"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <header className="flex items-center gap-3 border-b border-border bg-brand-gradient px-4 py-3 text-white">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
              <Headset className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Assistenza PropertyTech Solutions</p>
              <p className="flex items-center gap-1.5 text-xs text-white/85">
                <span className="h-2 w-2 rounded-full bg-status-qualified" aria-hidden="true" />
                Online 24/7
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Chiudi l'assistenza"
              className="shrink-0 rounded-lg p-1.5 transition-colors duration-200 hover:bg-white/20"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            <Bubble role="assistant">
              <RichText text={SUPPORT_GREETING} />
            </Bubble>

            {messages.length === 0 && (
              <div className="flex flex-wrap gap-1.5">
                {SUPPORT_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => send(suggestion)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {messages.map((message, index) => (
              <Bubble key={index} role={message.role}>
                {message.role === "assistant" ? (
                  <RichText text={message.content} />
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
              </Bubble>
            ))}

            {isSending && (
              <Bubble role="assistant">
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  L&apos;assistente sta scrivendo…
                </p>
              </Bubble>
            )}

            {error && (
              <p role="alert" className="text-xs text-status-blocked">
                {error}
              </p>
            )}
          </div>

          <div className="border-t border-border p-3">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send(draft);
              }}
              className="flex items-end gap-2"
            >
              <label htmlFor="support-input" className="sr-only">
                Scrivi la tua domanda
              </label>
              <textarea
                ref={inputRef}
                id="support-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  // Invio manda, Maiusc+Invio va a capo: è la convenzione di
                  // ogni chat, e chi scrive da telefono non cerca un pulsante.
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(draft);
                  }
                }}
                rows={1}
                maxLength={MAX_QUESTION_LENGTH}
                placeholder="Scrivi la tua domanda…"
                className="max-h-24 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-border-strong bg-background px-3 py-2 text-base text-foreground sm:text-sm outline-none transition-all duration-200 placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="submit"
                disabled={isSending || draft.trim().length < 2}
                aria-label="Invia la domanda"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white transition-all duration-200 hover:brightness-110 disabled:opacity-40"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </form>

            <DirectHelpLink />
          </div>
        </div>
      )}
    </>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const isUser = role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
          isUser
            ? "rounded-br-sm bg-brand-gradient text-white"
            : "rounded-bl-sm bg-muted text-foreground"
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Scorciatoia verso una persona.
 *
 * Punta a WhatsApp solo se il numero è configurato: un pulsante "Scrivici su
 * WhatsApp" che apre una chat vuota o un numero inesistente è peggio di un
 * indirizzo email che funziona. Senza numero, ripiega sulla casella di
 * assistenza.
 */
function DirectHelpLink() {
  const whatsapp = BRAND.supportWhatsApp;

  // Solo "Contattaci" è il collegamento, non l'intera frase: un link che
  // comprende anche la domanda non dice dove porta.
  const link = whatsapp
    ? { href: `https://wa.me/${whatsapp}`, external: true }
    : // Ripiego se un domani il numero venisse tolto: meglio la casella di
      // assistenza che un `wa.me/` senza numero, che apre una pagina d'errore.
      { href: `mailto:${BRAND.supportEmail}`, external: false };

  return (
    <p className="mt-2 text-center text-xs text-muted-foreground">
      Serve aiuto diretto?{" "}
      <a
        href={link.href}
        {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="font-medium text-primary underline underline-offset-2 transition-colors duration-200 hover:text-brand-cyan"
      >
        Contattaci
      </a>
      .
    </p>
  );
}
