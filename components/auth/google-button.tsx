"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";

/** Logo Google ufficiale a 4 colori: non va ricolorato secondo le linee guida del brand. */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

interface GoogleButtonProps {
  label?: string;
  /**
   * Rotta a cui tornare dopo l'autenticazione. Il middleware, quando
   * intercetta un utente non autenticato, riporta la pagina richiesta in
   * `?callbackUrl=`: propagarla qui evita che chi arriva da un link profondo
   * venga comunque scaricato sulla dashboard.
   */
  callbackUrl?: string;
}

/** Accetta solo percorsi interni: un callbackUrl assoluto sarebbe un open redirect. */
function safeCallbackUrl(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export function GoogleButton({ label = "Accedi con Google", callbackUrl }: GoogleButtonProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        setIsRedirecting(true);
        signIn("google", { callbackUrl: safeCallbackUrl(callbackUrl) });
      }}
      disabled={isRedirecting}
      className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-muted hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
    >
      {isRedirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleGlyph />}
      {label}
    </button>
  );
}

/** Separatore "oppure" fra accesso social e form tradizionale. */
export function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">oppure</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
