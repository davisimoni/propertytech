"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * La prima cosa che un agente vede in una sezione dove non ha ancora fatto
 * nulla — e la ragione per cui non deve essere una tabella vuota.
 *
 * # Perché un componente unico per quattro moduli diversi
 *
 * Perché la domanda che un nuovo utente si fa è sempre la stessa — "a cosa
 * serve questo, e cosa faccio adesso?" — e la risposta ha sempre la stessa
 * forma: cosa fa l'AI qui, in due righe concrete, e un pulsante che parte
 * subito. Quattro empty state disegnati a mano avrebbero divergito uno
 * dall'altro nel giro di un ritocco, e la prima cosa a differire sarebbe
 * stata proprio la chiarezza.
 *
 * # Perché l'azione secondaria è opzionale e non un secondo bottone uguale
 *
 * Perché non tutti i moduli hanno un esempio onesto da offrire. Un "prova
 * con un esempio" ha senso quando esiste un dato di prova innocuo — un
 * prompt, una nota di testo — mentre fingerne uno per un'estrazione da
 * documento vorrebbe dire spacciare un documento d'identità inventato per
 * uno vero. Il secondo pulsante compare solo dove il chiamante lo fornisce
 * davvero, non come placeholder.
 */
interface EmptyStateAction {
  label: string;
  /** Navigazione a un'altra pagina o a un link con parametri (es. deep link). */
  href?: string;
  /** Azione dentro la pagina corrente (es. aprire un drawer, cambiare scheda). */
  onClick?: () => void;
  icon?: LucideIcon;
}

export function EmptyStateCard({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  icon: LucideIcon;
  title: string;
  /** Due righe: cosa fa l'AI qui, in termini pratici. Non un titolo più lungo. */
  description: string;
  primaryAction: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <ActionButton action={primaryAction} variant="primary" />
        {secondaryAction && <ActionButton action={secondaryAction} variant="secondary" />}
      </div>
    </div>
  );
}

function ActionButton({
  action,
  variant,
}: {
  action: EmptyStateAction;
  variant: "primary" | "secondary";
}) {
  const className = cn("text-xs", variant === "primary" ? "btn-brand" : "btn-outline");
  const Icon = action.icon;
  const content = (
    <>
      {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
      {action.label}
    </>
  );

  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={action.onClick} className={className}>
      {content}
    </button>
  );
}
