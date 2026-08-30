import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Reso a ogni richiesta: con il prerender statico il dominio verrebbe congelato
 * al momento della build, e una `SITE_URL` impostata solo nell'ambiente di
 * esecuzione produrrebbe una sitemap piena di URL localhost.
 */
export const dynamic = "force-dynamic";

/**
 * Solo rotte pubbliche: le pagine dietro autenticazione non vanno indicizzate
 * e includerle produrrebbe errori di scansione.
 *
 * Fuori anche `/docs`, `/help` e `/terms`: sono redirect verso `/guida` e
 * `/termini`. Dichiarare in sitemap un URL che risponde 307 e' un invito a
 * scansionare qualcosa che rimanda altrove, e i motori lo segnalano come
 * difetto invece di seguirlo.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/register`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/login`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    // La guida è la pagina che risponde alle ricerche di chi sta valutando lo
    // strumento: merita più priorità delle pagine legali.
    { url: `${SITE_URL}/guida`, lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/termini`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/cookie`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/dpa`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
