"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

type Stato = "in-corso" | "disiscritto" | "riattivato" | "errore";

const TESTO_SERVIZIO =
  "Le comunicazioni di servizio sul tuo account (nuovo lead qualificato, sessione WhatsApp, crediti operativi, pubblicazioni social, abbonamento e sicurezza) continueranno ad arrivare.";

/**
 * Esegue la disiscrizione appena la pagina si apre nel browser.
 *
 * Per chi ha cliccato il link è un solo clic. I filtri antispam che aprono i
 * link delle email per controllarli non eseguono questo codice, quindi non
 * disiscrivono nessuno al posto suo. Il pulsante "Riattiva" rimedia a un clic
 * fatto per errore, con lo stesso token.
 */
export function AutoDisiscrizione({ token }: { token: string }) {
  const [stato, setStato] = useState<Stato>("in-corso");
  const eseguita = useRef(false);

  async function invia(azione: "disiscrivi" | "riattiva") {
    setStato("in-corso");
    const query = `token=${encodeURIComponent(token)}${azione === "riattiva" ? "&azione=riattiva" : ""}`;
    try {
      const risposta = await fetch(`/api/unsubscribe?${query}`, { method: "POST" });
      if (!risposta.ok) throw new Error();
      setStato(azione === "riattiva" ? "riattivato" : "disiscritto");
    } catch {
      setStato("errore");
    }
  }

  useEffect(() => {
    // Una sola volta anche con il doppio montaggio di React in sviluppo.
    if (eseguita.current) return;
    eseguita.current = true;
    void invia("disiscrivi");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stato === "in-corso") {
    return (
      <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Aggiornamento delle preferenze in corso.
      </p>
    );
  }

  if (stato === "errore") {
    return (
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Non è stato possibile completare la disiscrizione. Riprova tra qualche minuto, oppure
        gestisci la newsletter da{" "}
        <Link href="/settings?tab=privacy" className="font-medium text-primary hover:underline">
          Impostazioni, Privacy e Normativa
        </Link>
        .
      </p>
    );
  }

  if (stato === "riattivato") {
    return (
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        La newsletter è di nuovo attiva: riceverai il prossimo numero del martedì o del giovedì.
      </p>
    );
  }

  return (
    <div aria-live="polite">
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Disiscrizione completata.</strong> Non riceverai più la
        newsletter. {TESTO_SERVIZIO}
      </p>
      <button
        type="button"
        onClick={() => void invia("riattiva")}
        className="mt-5 text-sm font-medium text-primary hover:underline"
      >
        Mi sono disiscritto per errore: riattiva la newsletter
      </button>
    </div>
  );
}
