import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** Come la sitemap: il dominio va risolto a runtime, non congelato in build. */
export const dynamic = "force-dynamic";

/**
 * Aree private o senza valore per l'indicizzazione.
 *
 * # Come si tiene aggiornato
 *
 * Ogni rotta sotto `app/(app)/` va elencata qui. Non è automatico e va
 * ricordato: `/properties`, `/radar` e `/bonuses` erano nate dopo questo
 * elenco e ci sono rimaste fuori per mesi. Nessuno se n'era accorto perché
 * richiedono l'accesso e un crawler ci trova un reindirizzamento, ma quel
 * reindirizzamento compare in Search Console come errore di scansione su una
 * pagina che non doveva nemmeno essere visitata.
 *
 * # Perché anche le pagine con un token nell'indirizzo
 *
 * `/reset-password` e `/invito/` sono pubbliche — non richiedono una sessione
 * — ma portano un segreto nell'URL. Un crawler che ne segue uno consuma il
 * token al posto della persona a cui era destinato, e quella persona trova un
 * invito già usato o un link di ripristino scaduto senza aver fatto niente.
 */
const DISALLOWED = [
  "/api/",
  // Area riservata: tutte le rotte di `app/(app)/`.
  "/dashboard",
  "/leads",
  "/properties",
  "/documents",
  "/social",
  "/voice-reports",
  "/radar",
  "/bonuses",
  "/settings",
  // Pubbliche, ma con un segreto nell'indirizzo.
  "/reset-password",
  "/invito/",
];

/**
 * Crawler dei motori generativi. Sono elencati esplicitamente perché alcuni
 * ignorano la regola `User-agent: *` e vanno autorizzati per nome: senza,
 * PropertyTech non comparirebbe nelle risposte di ChatGPT, Perplexity o Gemini.
 *
 * `Google-Extended` non governa la comparsa in Ricerca Google — quella dipende
 * da `Googlebot` — ma l'uso dei contenuti per Gemini e le AI Overviews.
 */
const AI_CRAWLERS = [
  "GPTBot", // ChatGPT — indicizzazione
  "OAI-SearchBot", // ChatGPT Search
  "ChatGPT-User", // navigazione su richiesta dell'utente
  "ClaudeBot", // Claude — indicizzazione
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended", // Gemini e AI Overviews
  "Applebot-Extended",
  "meta-externalagent",
  "Bingbot",
  "cohere-ai",
  // ByteDance (Doubao, e i risultati generativi dentro TikTok). Ha una
  // reputazione di crawler aggressivo: e' elencato per essere autorizzato
  // esplicitamente sulle pagine pubbliche, mentre le esclusioni di `DISALLOWED`
  // continuano a valere per lui come per gli altri.
  "Bytespider",
  "Amazonbot",
  "YouBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOWED },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: DISALLOWED,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
