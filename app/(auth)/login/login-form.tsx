"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { ShieldCheck } from "lucide-react";
import { FormField } from "@/components/auth/form-field";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { BRAND } from "@/lib/brand";

export function LoginForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("Email o password non corretti.");
        return;
      }
      router.push(searchParams.get("callbackUrl") ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Accesso non riuscito. Riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h1 className="text-lg font-semibold text-foreground">Bentornato</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Accedi per vedere i lead che {BRAND.name} ha qualificato per te.
      </p>

      {googleEnabled && (
        <>
          <div className="mt-6">
            <GoogleButton
              label="Accedi con Google"
              callbackUrl={searchParams.get("callbackUrl") ?? undefined}
            />
          </div>
          <AuthDivider />
        </>
      )}

      <form
        onSubmit={handleSubmit}
        className={googleEnabled ? "space-y-4" : "mt-6 space-y-4"}
        noValidate
      >
        <FormField id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <FormField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        {/* Sotto il campo password, dove serve: chi non la ricorda se ne
            accorge proprio mentre lo sta compilando. */}
        <p className="text-right text-xs">
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            Password dimenticata?
          </Link>
        </p>

        {error && (
          <p role="alert" className="text-sm text-status-blocked">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50"
        >
          {isSubmitting ? "Accesso…" : "Accedi"}
        </button>
      </form>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />I tuoi dati restano
        privati e conformi al GDPR UE
      </p>

      <p className="mt-3 text-center text-sm text-muted-foreground">
        Non hai un account?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Prova gratis
        </Link>
      </p>
    </div>
  );
}
