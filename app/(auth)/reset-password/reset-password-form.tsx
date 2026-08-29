"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { FormField } from "@/components/auth/form-field";
// Da `password-rules` e non da `password-reset`: quello importa
// `node:crypto`, che in un componente client non esiste.
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-rules";

/**
 * Scelta della nuova password a partire dal link ricevuto.
 *
 * # Gli errori qui si spiegano
 *
 * Al contrario di `/forgot-password`, dove ogni risposta è identica per non
 * rivelare quali indirizzi esistono, chi arriva con un token in mano non sta
 * sondando nulla: sta cercando di rientrare nel proprio account. "Link
 * scaduto" gli dice cosa fare; un generico "non valido" lo lascia a copiare e
 * ricopiare lo stesso link convinto di aver sbagliato.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    password.length >= MIN_PASSWORD_LENGTH && password === confirm && !isSubmitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Controllo anche qui e non solo sul server: dire "le password non
    // coincidono" dopo un giro di rete è tempo perso per un errore che si vede
    // guardando i due campi.
    if (password !== confirm) {
      setError("Le due password non coincidono.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.message ?? "Non è stato possibile reimpostare la password.");
        return;
      }

      setDone(true);
      // Qualche secondo per leggere la conferma, poi all'accesso: dopo un
      // reset la sessione non esiste, quindi mandarlo altrove darebbe solo un
      // rimbalzo sul login.
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError("Errore di rete. Controlla la connessione e riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-status-blocked/10 text-status-blocked">
          <TriangleAlert className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-foreground">Link incompleto</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Manca il codice di ripristino. Alcuni programmi di posta spezzano i link lunghi: prova a
          copiarlo per intero, oppure richiedine uno nuovo.
        </p>
        <Link
          href="/forgot-password"
          className="mt-5 block w-full rounded-xl bg-brand-gradient px-4 py-2 text-center text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110"
        >
          Richiedi un nuovo link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-status-qualified/10 text-status-qualified">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-foreground">Password aggiornata</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Ora puoi accedere con la nuova password. Ti stiamo portando alla schermata di accesso.
        </p>
        <Link
          href="/login"
          className="mt-5 block w-full rounded-xl bg-brand-gradient px-4 py-2 text-center text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110"
        >
          Vai all&apos;accesso
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h1 className="text-lg font-semibold text-foreground">Scegli una nuova password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Almeno {MIN_PASSWORD_LENGTH} caratteri. Usane una che non hai già su altri servizi.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <FormField
          id="password"
          label="Nuova password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint={tooShort ? `Servono almeno ${MIN_PASSWORD_LENGTH} caratteri.` : undefined}
        />
        <FormField
          id="confirm"
          label="Ripeti la password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          hint={mismatch ? "Le due password non coincidono." : undefined}
        />

        {error && (
          <p role="alert" className="text-sm text-status-blocked">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50"
        >
          {isSubmitting ? "Salvataggio…" : "Salva la nuova password"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Torna all&apos;accesso
        </Link>
      </p>
    </div>
  );
}
