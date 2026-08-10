"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Messaggi di attesa che si alternano durante le chiamate all'AI.
 *
 * Un'attesa di dieci secondi con scritto "Caricamento…" sembra un blocco; la
 * stessa attesa che racconta cosa sta succedendo — analisi catastale, poi
 * estrazione degli intestatari — sembra lavoro in corso. I testi descrivono
 * passaggi che avvengono davvero: promettere fasi inventate è il modo più
 * rapido per far perdere fiducia allo strumento.
 */

/** Ogni quanto ruota il messaggio. Sotto i 2s si legge a fatica. */
const ROTATION_MS = 2600;

interface ProgressMessagesProps {
  messages: readonly string[];
  className?: string;
  /** Da disattivare quando il chiamante mostra già un proprio indicatore. */
  showSpinner?: boolean;
}

export function ProgressMessages({
  messages,
  className,
  showSpinner = true,
}: ProgressMessagesProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (messages.length <= 1) return;

    const interval = setInterval(() => {
      // Si ferma sull'ultimo messaggio invece di tornare al primo: ricominciare
      // il giro suggerisce che il lavoro sia ripartito da capo.
      setIndex((current) => Math.min(current + 1, messages.length - 1));
    }, ROTATION_MS);

    return () => clearInterval(interval);
  }, [messages]);

  return (
    <p
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", className)}
    >
      {showSpinner && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}
      {messages[index] ?? messages[0]}
    </p>
  );
}

/** Estrazione dati da visure, atti, planimetrie e APE (Modulo 2). */
export const DOCUMENT_PROGRESS = [
  "Lettura del documento in corso…",
  "Analisi catastale: foglio, particella, subalterno…",
  "Estrazione di intestatari e quote di proprietà…",
  "Verifica di rendita, categoria e annotazioni…",
  "Preparazione della sintesi per l'agente…",
] as const;

/** Generazione di annuncio, post e script Reel (Modulo 3). */
export const LISTING_PROGRESS = [
  "Lettura dei dati dell'immobile…",
  "Ottimizzazione del testo per Immobiliare.it e Idealista…",
  "Scrittura del post per Instagram e Facebook…",
  "Costruzione dello script del Reel scena per scena…",
  "Rifinitura dei contenuti…",
] as const;

/** Import di un annuncio da link (Modulo 3). */
export const IMPORT_PROGRESS = [
  "Apertura dell'annuncio…",
  "Estrazione di zona, superficie, locali e prezzo…",
  "Composizione della scheda immobile…",
] as const;

/** Trascrizione e stesura del report post-visita (Modulo 4). */
export const REPORT_PROGRESS = [
  "Trascrizione della nota vocale…",
  "Individuazione dei feedback dei visitatori…",
  "Analisi delle osservazioni sul prezzo…",
  "Stesura del report per il proprietario…",
] as const;

/** Salvataggio immobile e calcolo delle affinità con i lead. */
export const MATCHING_PROGRESS = [
  "Salvataggio dell'immobile in portafoglio…",
  "Calcolo affinità clienti-immobile…",
  "Confronto con budget, zona e tipologia richiesti…",
] as const;
