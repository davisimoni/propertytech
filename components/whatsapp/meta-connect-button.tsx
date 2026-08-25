"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Facebook, Loader2 } from "lucide-react";

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const META_CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID;
const SDK_VERSION = "v21.0";

interface FacebookLoginResponse {
  authResponse?: { code?: string };
}

declare global {
  interface Window {
    FB?: {
      init: (params: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

/**
 * Carica l'SDK Facebook una volta sola per l'intera pagina: `ConnectionPanel`
 * può rimontare (cambio scheda, refresh dei dati) senza che il browser
 * scarichi e reinizializzi lo stesso script più volte.
 */
function loadFacebookSdk(): Promise<void> {
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve) => {
    if (window.FB) {
      resolve();
      return;
    }

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: META_APP_ID as string,
        autoLogAppEvents: true,
        xfbml: true,
        version: SDK_VERSION,
      });
      resolve();
    };

    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/it_IT/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  });

  return sdkLoadPromise;
}

interface EmbeddedSignupData {
  phoneNumberId: string;
  wabaId?: string;
}

function isEmbeddedSignupMessage(payload: unknown): payload is {
  type: "WA_EMBEDDED_SIGNUP";
  event?: string;
  data?: { phone_number_id?: string; waba_id?: string };
} {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as Record<string, unknown>).type === "WA_EMBEDDED_SIGNUP"
  );
}

/**
 * Pulsante "Connetti con WhatsApp / Meta": avvia l'Embedded Signup ufficiale
 * di Meta (Facebook Login for Business) e collega il numero senza che
 * l'agente debba mai copiare un token a mano.
 *
 * Il flusso restituisce i due dati che servono in due canali separati e
 * asincroni, che questo componente deve correlare prima di poter chiamare il
 * backend:
 *  - il `code` di autorizzazione arriva dal callback di `FB.login`;
 *  - il Phone Number ID arriva invece da un `window.postMessage` che Meta
 *    invia al termine del flusso (evento `WA_EMBEDDED_SIGNUP` / `FINISH`).
 * Non c'è un ordine garantito fra i due: si aspetta che entrambi siano
 * arrivati prima di contattare `/api/whatsapp/meta/embedded-signup`.
 */
export function MetaConnectButton({ onConnected }: { onConnected: () => void }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<string | null>(null);
  const signupDataRef = useRef<EmbeddedSignupData | null>(null);

  const finishIfReady = useCallback(async () => {
    if (!codeRef.current || !signupDataRef.current) return;

    const code = codeRef.current;
    const { phoneNumberId, wabaId } = signupDataRef.current;
    // Consumati subito: un evento FINISH o una callback di FB.login
    // duplicati (l'utente che riprova, un doppio evento del popup) non
    // devono rispedire due volte la stessa coppia.
    codeRef.current = null;
    signupDataRef.current = null;

    setStatus("loading");
    setError(null);

    try {
      const response = await fetch("/api/whatsapp/meta/embedded-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, phoneNumberId, wabaId }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.message ?? "Collegamento non riuscito. Riprova o usa la configurazione avanzata.");
        setStatus("error");
        return;
      }

      setStatus("idle");
      onConnected();
    } catch {
      setError("Errore di rete durante il collegamento.");
      setStatus("error");
    }
  }, [onConnected]);

  // --- Ricezione del Phone Number ID dal popup Meta ---
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Solo Facebook può innescare questo flusso: qualunque altra origine
      // (compresa la nostra, per un postMessage non correlato) va ignorata.
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") {
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!isEmbeddedSignupMessage(payload)) return;

      if (payload.event === "FINISH" && payload.data?.phone_number_id) {
        signupDataRef.current = {
          phoneNumberId: payload.data.phone_number_id,
          wabaId: payload.data.waba_id,
        };
        finishIfReady();
      } else if (payload.event === "CANCEL") {
        setStatus("idle");
      } else if (payload.event === "ERROR") {
        setError("Meta ha segnalato un errore durante il collegamento. Riprova.");
        setStatus("error");
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [finishIfReady]);

  async function handleClick() {
    if (!META_APP_ID || !META_CONFIG_ID) return;

    setStatus("loading");
    setError(null);
    await loadFacebookSdk();

    window.FB?.login(
      (response) => {
        if (response.authResponse?.code) {
          codeRef.current = response.authResponse.code;
          finishIfReady();
        } else {
          // Popup chiuso o autorizzazione negata: non è un errore da mostrare,
          // l'agente ha semplicemente cambiato idea.
          setStatus("idle");
        }
      },
      {
        config_id: META_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, sessionInfoVersion: "3" },
      }
    );
  }

  if (!META_APP_ID || !META_CONFIG_ID) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        Il collegamento guidato non è ancora configurato su questo ambiente. Usa la configurazione
        avanzata qui sotto per inserire le credenziali manualmente.
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        // Blu ufficiale Facebook (#1877F2): un colore volutamente diverso dal
        // brand PropertyTech, perché qui è l'identità di Meta a garantire
        // all'agente che sta autorizzando Meta, non noi.
        className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#1877F2] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {status === "loading" ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <Facebook className="h-5 w-5" aria-hidden="true" />
        )}
        Connetti con WhatsApp / Meta
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-status-blocked">
          {error}
        </p>
      )}
    </div>
  );
}
