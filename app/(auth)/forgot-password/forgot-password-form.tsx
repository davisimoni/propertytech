"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, MailCheck } from "lucide-react";
import { FormField } from "@/components/auth/form-field";

/**
 * Richiesta del link di reimpostazione.
 *
 * # La conferma non dice se l'indirizzo esiste
 *
 * A invio riuscito compare sempre lo stesso messaggio, esattamente come
 * risponde la rotta. Dire "non troviamo questo indirizzo" trasformerebbe il
 * form in uno strumento per **scoprire quali email hanno un account**: un
 * elenco che vale parecchio per chi prepara un phishing mirato contro agenzie
 * immobiliari.
 *
 * È un compromesso consapevole: chi ha davvero sbagliato indirizzo aspetta
 * un'email che non arriva. Per questo la conferma suggerisce di controllare lo
 * spam e di riprovare con un altro indirizzo, invece di limitarsi a dire che è
 * andata bene.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.message ?? "Richiesta non riuscita. Riprova.");
        return;
      }

      setSent(true);
    } catch {
      setError("Errore di rete. Controlla la connessione e riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-status-qualified/10 text-status-qualified">
          <MailCheck className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-foreground">Controlla la posta</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Se l&apos;indirizzo è presente nei nostri sistemi, riceverai un link per reimpostare la
          password. Il link vale <strong className="text-foreground">un&apos;ora</strong> e si può
          usare una volta sola.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Non arriva? Controlla lo spam. Se hai più indirizzi, prova con quello che usi per
          accedere.
        </p>

        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-5 w-full rounded-xl border border-border-strong px-4 py-2 text-sm font-medium text-foreground transition-all duration-200 hover:bg-muted"
        >
          Prova con un altro indirizzo
        </button>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Torna all&apos;accesso
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h1 className="text-lg font-semibold text-foreground">Password dimenticata</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Inserisci l&apos;email con cui accedi: ti mandiamo un link per sceglierne una nuova.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <FormField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
        />

        {error && (
          <p role="alert" className="text-sm text-status-blocked">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !email.trim()}
          className="w-full rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50"
        >
          {isSubmitting ? "Invio in corso…" : "Invia link di ripristino"}
        </button>
      </form>

      <p className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Se ti sei registrato con Google, non serve una password: torna all&apos;accesso e usa il
        pulsante Google.
      </p>

      <p className="mt-3 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Torna all&apos;accesso
        </Link>
      </p>
    </div>
  );
}
