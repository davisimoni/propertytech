import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** Come la sitemap: il dominio va risolto a runtime, non congelato in build. */
export const dynamic = "force-dynamic";

/** Aree private o senza valore per l'indicizzazione. */
const DISALLOWED = ["/api/", "/dashboard", "/leads", "/documents", "/social", "/voice-reports", "/settings"];

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
