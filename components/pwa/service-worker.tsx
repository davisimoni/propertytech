"use client";

import { useEffect } from "react";

/**
 * Registra il service worker.
 *
 * Solo in produzione: in sviluppo un service worker attivo serve i file dalla
 * cache e fa sembrare che le modifiche non abbiano effetto, che è una mezz'ora
 * persa ogni volta.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // Dopo il caricamento: registrarlo subito competerebbe per la banda con le
    // risorse che servono a mostrare la pagina.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("[pwa] Registrazione del service worker non riuscita", error);
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
