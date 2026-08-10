"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { FormField } from "@/components/auth/form-field";

interface AcceptInviteFormProps {
  token: string;
  email: string;
  agencyName: string;
}

/**
 * Impostazione della password da parte del collaboratore invitato.
 *
 * A conferma avvenuta si effettua l'accesso da soli e si atterra in dashboard:
 * chiedere di ridigitare le credenziali appena scelte sarebbe un passaggio
 * inutile su un flusso che deve durare meno di un minuto.
 */
export function AcceptInviteForm({ token, email, agencyName }: AcceptInviteFormProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, firstName, lastName, password }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Non è stato possibile completare l'invito.");
        return;
      }

      const result = await signIn("credentials", { email, password, redirect: false });

      if (result?.error) {
        // L'account esiste comunque: si prosegue dall'accesso normale.
        router.push("/login");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h1 className="text-lg font-semibold text-foreground">Entra in {agencyName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Sei stato invitato come collaboratore. Imposta la tua password: da qui in poi accederai con{" "}
        <span className="font-medium text-foreground">{email}</span>.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="firstName"
            label="Nome"
            type="text"
            value={firstName}
            onChange={setFirstName}
            autoComplete="given-name"
          />
          <FormField
            id="lastName"
            label="Cognome"
            type="text"
            value={lastName}
            onChange={setLastName}
            autoComplete="family-name"
          />
        </div>

        <FormField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint="Almeno 8 caratteri."
        />

        {error && (
          <p role="alert" className="text-sm text-status-blocked">
            {error}
          </p>
        )}

        <button type="submit" disabled={isSubmitting} className="btn-brand w-full">
          {isSubmitting ? "Attivazione in corso…" : "Attiva il mio accesso"}
        </button>
      </form>
    </div>
  );
}
