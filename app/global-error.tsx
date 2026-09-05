"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * L'ultima rete: un errore che sfugge a tutto il resto.
 *
 * # Perché serviva
 *
 * Perché non c'era. Un errore di rendering non gestito mostrava la pagina di
 * errore grezza di Next — sfondo bianco, testo tecnico in inglese, nessuna
 * via d'uscita — a un agente che magari stava caricando una perizia davanti
 * al cliente. Non è un dettaglio estetico: senza un pulsante, l'unica mossa
 * possibile è chiudere l'applicazione.
 *
 * # Perché ripete `<html>` e `<body>`
 *
 * Perché `global-error` sostituisce il layout radice, che in quel momento
 * potrebbe essere proprio ciò che è andato storto. Non è una duplicazione per
 * distrazione: Next lo richiede.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          background: "#f7f8fa",
          color: "#111827",
        }}
      >
        {/* Stili in linea e non con Tailwind: se a rompersi è stato il layout
            radice, il foglio di stile potrebbe non essere stato caricato, e
            una pagina d'errore che si presenta senza stile è un secondo
            errore sopra il primo. */}
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            Qualcosa si è interrotto
          </h1>
          <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", lineHeight: 1.6, color: "#4b5563" }}>
            L&apos;errore è stato registrato e lo stiamo guardando. I tuoi dati e le conversazioni
            in corso non sono stati toccati.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              minHeight: "2.75rem",
              padding: "0 1.25rem",
              borderRadius: "0.75rem",
              border: "none",
              background: "#111827",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Riprova
          </button>

          <p style={{ marginTop: "1rem", fontSize: "0.75rem", color: "#6b7280" }}>
            Se succede di nuovo scrivi a supporto@propertytechsolutions.net
            {error.digest ? ` citando il codice ${error.digest}` : ""}.
          </p>
        </main>
      </body>
    </html>
  );
}
