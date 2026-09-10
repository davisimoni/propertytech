import { cn } from "@/lib/utils";

/**
 * Segnaposto animato per i dati in arrivo.
 *
 * # Perché non uno spinner
 *
 * Perché uno spinner dice "sto caricando" e basta; una sagoma dice anche
 * *cosa* sta arrivando, e quanto. La pagina non salta quando i dati entrano —
 * lo spazio è già occupato — e l'attesa sembra più breve a parità di
 * millisecondi, perché c'è qualcosa da leggere invece che un punto che gira.
 *
 * Niente `"use client"`: è solo markup, e così resta usabile anche dai
 * Server Component senza trascinarli nel bundle del browser.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-lg bg-muted", className)}
    />
  );
}

/**
 * Un elenco di righe finte, per le liste che si caricano da una fetch.
 *
 * `role="status"` con testo per lo screen reader: chi non vede l'animazione
 * deve comunque sapere che l'attesa è in corso, altrimenti la pagina sembra
 * semplicemente vuota.
 */
export function SkeletonList({
  rows = 3,
  className,
  label = "Caricamento in corso",
}: {
  rows?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn("space-y-2", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}
