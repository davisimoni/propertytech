"use client";

import { useEffect } from "react";

/**
 * Scorrimento fluido verso l'ancora dell'URL, all'apertura della pagina.
 *
 * Serve perché in App Router una navigazione client verso `/settings#prezzi`
 * non fa scorrere il browser: al momento in cui la rotta cambia la sezione non
 * è ancora nel DOM, e l'ancora nativa si perde. Chi clicca "Aggiorna piano"
 * arriverebbe in cima alla pagina delle impostazioni, senza capire perché.
 *
 * Rispetta `prefers-reduced-motion`: un'animazione di scorrimento lunga è un
 * problema d'accessibilità concreto per chi soffre di disturbi vestibolari, e
 * lì si salta direttamente a destinazione.
 */
export function ScrollToHash() {
  useEffect(() => {
    let frame = 0;

    function scrollToHash() {
      const hash = window.location.hash.slice(1);
      if (!hash) return;

      // Doppio rAF: il primo restituisce il controllo dopo il commit di React,
      // il secondo dopo che il browser ha calcolato il layout. Senza, l'elemento
      // esiste ma la sua posizione è ancora quella di prima del render.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          const target = document.getElementById(hash);
          if (!target) return;

          const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
        });
      });
    }

    scrollToHash();

    // Serve quando si è **già** sulla pagina: il paywall che rimanda al listino
    // cambia solo l'ancora, la pagina non si rimonta e senza questo ascolto lo
    // scorrimento non partirebbe mai.
    window.addEventListener("hashchange", scrollToHash);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", scrollToHash);
    };
  }, []);

  return null;
}
