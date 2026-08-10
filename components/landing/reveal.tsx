"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Comparsa in dissolvenza all'ingresso nel viewport, per la sola landing.
 *
 * Il contenuto parte visibile e viene nascosto solo dopo il montaggio: se
 * JavaScript non gira, o `IntersectionObserver` non è disponibile, la pagina
 * resta leggibile invece di apparire vuota. Nascondere il testo nell'HTML
 * servito sarebbe un rischio inutile su una pagina che deve anche essere
 * indicizzata.
 */

/** Quanto sale l'elemento prima di comparire, in px, vive nel CSS (.reveal). */
const ROOT_MARGIN = "0px 0px -12% 0px";

interface RevealProps {
  children: ReactNode;
  /** Ritardo in ms, per far entrare gli elementi di una riga in sequenza. */
  delayMs?: number;
  className?: string;
}

export function Reveal({ children, delayMs = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "pending" | "visible">("idle");

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Senza observer si mostra tutto subito: meglio nessuna animazione che
    // contenuto irraggiungibile.
    if (typeof IntersectionObserver === "undefined") {
      setState("visible");
      return;
    }

    // Già dentro il viewport al primo render (es. arrivo con l'ancora #prezzi):
    // non ha senso nasconderlo per poi rivelarlo.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
      setState("visible");
      return;
    }

    setState("pending");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          // Una sola volta: rianimare a ogni passaggio distrae e basta.
          setState("visible");
          observer.disconnect();
        }
      },
      { rootMargin: ROOT_MARGIN, threshold: 0.05 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", className)}
      data-reveal={state === "idle" ? undefined : state}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
