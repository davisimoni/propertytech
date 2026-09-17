"use client";

import { useCallback, useEffect, useState } from "react";
import { ricordaIscrizione, revocaIscrizioneDispositivo, sincronizzaRevoca } from "@/lib/push/device";

/**
 * Stato delle notifiche push su QUESTO dispositivo.
 *
 * Le notifiche si attivano per browser, non per account: la stessa persona
 * può averle sul telefono e non sul computer dell'ufficio. Per questo lo stato
 * si legge dal browser (`PushManager`), e il server conserva solo l'elenco
 * dei dispositivi a cui inviare.
 *
 * - `non-supportato`: il browser non gestisce le push.
 * - `ios-installa`: iPhone o iPad da Safari. Apple consente le push solo
 *   all'app aggiunta alla schermata Home.
 * - `non-configurato`: manca la chiave pubblica VAPID nell'ambiente.
 * - `bloccato`: l'utente ha negato il permesso. Il browser non permette di
 *   chiederlo di nuovo: va riattivato dalle impostazioni del sito.
 * - `disattivo` / `attivo`.
 */
export type StatoPush =
  | "caricamento"
  | "non-supportato"
  | "ios-installa"
  | "non-configurato"
  | "bloccato"
  | "disattivo"
  | "attivo";

const CHIAVE_PUBBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function chiaveInByte(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const binario = atob(base64);
  const byte = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) byte[i] = binario.charCodeAt(i);
  return byte;
}

function isIosSenzaInstallazione(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installata =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !installata;
}

async function registrazione(): Promise<ServiceWorkerRegistration> {
  // `register` restituisce la registrazione esistente se lo script è lo
  // stesso: nessun doppio service worker.
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

async function salvaSulServer(iscrizione: PushSubscription): Promise<void> {
  const risposta = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(iscrizione.toJSON()),
  });
  if (!risposta.ok) throw new Error(`Iscrizione rifiutata (${risposta.status})`);
  ricordaIscrizione(iscrizione);
}

export function usePushNotifications() {
  const [stato, setStato] = useState<StatoPush>("caricamento");
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    let attivo = true;

    (async () => {
      const supportato =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

      if (!supportato) {
        if (attivo) setStato(isIosSenzaInstallazione() ? "ios-installa" : "non-supportato");
        return;
      }

      // Prima di tutto: se le notifiche sono state revocate dal browser da
      // quando l'app le ha attivate, il server smette subito di conservare
      // l'indirizzo di questo dispositivo.
      await sincronizzaRevoca();
      if (!CHIAVE_PUBBLICA) {
        if (attivo) setStato("non-configurato");
        return;
      }
      if (Notification.permission === "denied") {
        if (attivo) setStato("bloccato");
        return;
      }

      const reg = await navigator.serviceWorker.getRegistration("/");
      const iscrizione = await reg?.pushManager.getSubscription();

      if (iscrizione && Notification.permission === "granted") {
        // Riallinea il server a ogni apertura: se il dispositivo è passato a
        // un altro account, o la riga è stata rimossa, torna a posto da solo.
        salvaSulServer(iscrizione).catch(() => undefined);
        if (attivo) setStato("attivo");
      } else if (attivo) {
        setStato("disattivo");
      }
    })().catch(() => {
      if (attivo) setStato("non-supportato");
    });

    return () => {
      attivo = false;
    };
  }, []);

  /** Da chiamare dentro un clic: i browser concedono il permesso solo a un gesto dell'utente. */
  const attiva = useCallback(async (): Promise<boolean> => {
    if (!CHIAVE_PUBBLICA) return false;
    setInCorso(true);
    try {
      // Il permesso PRIMA di ogni altra attesa: Safari lo concede solo se la
      // richiesta parte ancora dentro il gesto dell'utente.
      const permesso = await Notification.requestPermission();
      if (permesso !== "granted") {
        setStato(permesso === "denied" ? "bloccato" : "disattivo");
        return false;
      }

      const reg = await registrazione();
      const iscrizione =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: chiaveInByte(CHIAVE_PUBBLICA),
        }));

      try {
        await salvaSulServer(iscrizione);
      } catch (error) {
        // Iscrizione non salvata: la si annulla anche nel browser, altrimenti
        // l'interruttore direbbe "attivo" per un dispositivo che non riceverà.
        await iscrizione.unsubscribe().catch(() => undefined);
        throw error;
      }

      setStato("attivo");
      return true;
    } catch (error) {
      console.warn("[push] Attivazione non riuscita", error);
      setStato((attuale) => (attuale === "attivo" ? "attivo" : "disattivo"));
      return false;
    } finally {
      setInCorso(false);
    }
  }, []);

  const disattiva = useCallback(async (): Promise<boolean> => {
    setInCorso(true);
    try {
      await revocaIscrizioneDispositivo();
      setStato("disattivo");
      return true;
    } catch (error) {
      console.warn("[push] Disattivazione non riuscita", error);
      return false;
    } finally {
      setInCorso(false);
    }
  }, []);

  return { stato, inCorso, attiva, disattiva };
}
