import type { MetadataRoute } from "next";

/**
 * Manifest PWA.
 *
 * Reso da Next su `/manifest.webmanifest`. Serve a rendere la piattaforma
 * installabile sullo smartphone dell'agente: buona parte del lavoro si fa in
 * visita e in sopralluogo, non alla scrivania (CLAUDE.md §1).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // `name` e `short_name` identici e senza qualificazioni: `name` è quello
    // che Android usa per la schermata di avvio e la voce nelle impostazioni,
    // `short_name` quello sotto l'icona. Tenerli diversi farebbe comparire due
    // nomi per la stessa app a seconda di dove la si guarda.
    name: "PropertyTech",
    short_name: "PropertyTech",
    description:
      "Qualifica i lead su WhatsApp, leggi visure e atti, gestisci agenda e trattative dal telefono.",
    start_url: "/dashboard",
    // `standalone`: aperta dall'icona si comporta come un'app, senza barra
    // degli indirizzi. È ciò che rende accettabile usarla in piedi davanti a
    // un portone.
    display: "standalone",
    orientation: "portrait",
    background_color: "#F8FAFC",
    theme_color: "#0066FF",
    lang: "it-IT",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Separata dalle altre: Android ritaglia le maskable in un cerchio, e
      // usare la stessa immagine taglierebbe il tetto della casa.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Qualifica lead", short_name: "Lead", url: "/leads" },
      { name: "Agenda", short_name: "Agenda", url: "/settings/calendar" },
    ],
  };
}
