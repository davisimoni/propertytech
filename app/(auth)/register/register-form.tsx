"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Gift, ShieldCheck } from "lucide-react";
import { FormField } from "@/components/auth/form-field";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { registerSchema } from "@/lib/validation/auth";
import {
  REFEREE_WELCOME_DISCOUNT_PERCENT,
  REFERRAL_COOKIE_NAME,
  REFERRER_DISCOUNT_PERCENT,
} from "@/lib/referrals/constants";

/** Un'ora: basta a coprire form + eventuale giro su Google, non deve sopravvivere a lungo nel browser. */
const REFERRAL_COOKIE_MAX_AGE_SECONDS = 60 * 60;

export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referralCode = searchParams.get("ref")?.trim().toUpperCase() || null;

  // Il cookie porta il codice attraverso il redirect OAuth di Google, che non
  // lascia passare un campo di form (auth.ts lo rilegge da lì). Per il form
  // a credenziali basterebbe il body della POST, ma scriverlo comunque non
  // costa nulla ed evita un secondo percorso da mantenere.
  useEffect(() => {
    if (!referralCode) return;
    document.cookie = `${REFERRAL_COOKIE_NAME}=${referralCode}; path=/; max-age=${REFERRAL_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  }, [referralCode]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = registerSchema.safeParse({
      firstName,
      lastName,
      agencyName,
      email,
      password,
      acceptedTerms,
      referralCode: referralCode ?? undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dati non validi.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (response.status === 409) {
        setError("Esiste già un account con questa email.");
        return;
      }
      if (!response.ok) {
        setError("Registrazione non riuscita. Riprova.");
        return;
      }

      const signInResult = await signIn("credentials", {
        email: parsed.data.email,
        password: parsed.data.password,
        redirect: false,
      });

      if (signInResult?.error) {
        router.push("/login");
        return;
      }

      // Se l'utente arrivava dalla tabella prezzi, riprende da dove aveva
      // interrotto: le impostazioni, con piano e periodicità già selezionati.
      const selectedPlan = searchParams.get("plan");
      const selectedInterval = searchParams.get("interval");
      const destination = selectedPlan
        ? `/settings?plan=${selectedPlan}${selectedInterval ? `&interval=${selectedInterval}` : ""}`
        : "/dashboard";
      router.push(destination);
      router.refresh();
    } catch {
      setError("Registrazione non riuscita. Riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h1 className="text-lg font-semibold text-foreground">Crea il tuo account gratuito</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Inizia gratis in 60 secondi. Nessun pagamento richiesto.
      </p>

      {referralCode && (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
          <Gift className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          Sei stato invitato con il codice <span className="font-medium">{referralCode}</span>:
          quando attivi un piano a pagamento, tu ricevi il {REFEREE_WELCOME_DISCOUNT_PERCENT}% di
          sconto di benvenuto sul primo abbonamento, e chi ti ha invitato ottiene il{" "}
          {REFERRER_DISCOUNT_PERCENT}% di sconto ricorrente per sempre sul proprio piano.
        </p>
      )}

      {googleEnabled && (
        <>
          <div className="mt-6">
            <GoogleButton label="Registrati con Google" />
          </div>
          <AuthDivider />
        </>
      )}

      <form
        onSubmit={handleSubmit}
        className={googleEnabled ? "space-y-4" : "mt-6 space-y-4"}
        noValidate
      >
        {/* Affiancati da sm in su, impilati su smartphone: due campi corti su
            una riga sola sarebbero stretti da compilare sul campo. */}
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
          id="agencyName"
          label="Nome Agenzia"
          type="text"
          value={agencyName}
          onChange={setAgencyName}
          autoComplete="organization"
          required={false}
          hint="Puoi aggiungerlo dopo: lo chiediamo in dashboard al primo accesso."
        />
        <FormField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(event) => setAcceptedTerms(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-2 focus:ring-primary/30"
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            Accetto i{" "}
            <Link href="/termini" target="_blank" className="font-medium text-primary hover:underline">
              Termini di Servizio
            </Link>
            , l&apos;{" "}
            <Link href="/privacy" target="_blank" className="font-medium text-primary hover:underline">
              Informativa Privacy
            </Link>{" "}
            e l&apos;{" "}
            <Link href="/dpa" target="_blank" className="font-medium text-primary hover:underline">
              Accordo sul trattamento dei dati
            </Link>
            : i dati che carico restano di mia proprietà, risiedono su server UE e sono trattati solo
            per erogare il servizio.
          </span>
        </label>

        {error && (
          <p role="alert" className="text-sm text-status-blocked">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !acceptedTerms}
          className="w-full rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50"
        >
          {isSubmitting ? "Creazione account…" : "Crea account gratuito"}
        </button>
      </form>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />I tuoi dati restano
        privati e conformi al GDPR UE
      </p>

      <p className="mt-3 text-center text-sm text-muted-foreground">
        Hai già un account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Accedi
        </Link>
      </p>
    </div>
  );
}
