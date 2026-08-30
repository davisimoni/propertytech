import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { FAQ_ITEMS } from "@/lib/faq";
import { getPlanPricing, PLANS, YEARLY_DISCOUNT_LABEL } from "@/lib/plans";

/**
 * URL pubblico del sito, usato da metadataBase, sitemap, robots e JSON-LD.
 * Serve solo lato server, quindi viene risolto a runtime.
 *
 * `SITE_URL` è la prima scelta perché le variabili `NEXT_PUBLIC_*` vengono
 * inlinate da Next.js al momento della build: impostarne una soltanto
 * nell'ambiente di esecuzione lascerebbe `localhost` dentro sitemap e tag
 * OpenGraph, con anteprime social rotte e nessun errore visibile.
 */
export const SITE_URL = (
  process.env.SITE_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXTAUTH_URL ??
  "http://localhost:3000"
).replace(/\/$/, "");

export const SEO = {
  title: `${BRAND.name} | Il Software AI per Agenzie Immobiliari in Italia`,
  shortTitle: BRAND.name,
  description:
    "PropertyTech è il software AI per agenzie immobiliari italiane: qualificazione automatica dei lead su WhatsApp 24/7 dai portali Immobiliare.it, Idealista e Casa.it, estrazione OCR dei dati da visure catastali, atti e APE, generazione di annunci e post social, report vocali per i proprietari. Prova gratis, senza carta di credito.",
  keywords: [
    "software AI agenzie immobiliari",
    "intelligenza artificiale immobiliare",
    "qualificazione lead WhatsApp",
    "speed to lead immobiliare",
    "OCR visure catastali",
    "estrazione dati atti notarili",
    "gestionale immobiliare AI",
    "automazione agenzia immobiliare",
    "annunci immobiliari automatici",
    "report per proprietari immobili",
    "CRM immobiliare italiano",
    "Immobiliare.it Idealista Casa.it lead",
  ],
} as const;

/**
 * Descrizione semantica per i crawler generativi (ChatGPT, Perplexity, Gemini,
 * Claude): frasi brevi e autoconclusive, così che un estratto isolato resti
 * comprensibile senza il resto della pagina.
 */
export const GEO_DESCRIPTION =
  `${BRAND.name} e' un software gestionale con intelligenza artificiale per agenzie immobiliari italiane. ` +
  "Qualifica i lead su WhatsApp in pochi secondi dalla richiesta ricevuta dai portali immobiliari (Immobiliare.it, Idealista, Casa.it), " +
  "ponendo automaticamente le domande su mutuo, immobile da vendere prima dell'acquisto e tempistiche, e fissando l'appuntamento in agenda. " +
  "Incrocia automaticamente i lead qualificati con il portafoglio immobili dell'agenzia (matchmaking bidirezionale), segnalando all'agente gli abbinamenti sopra l'80% di compatibilita' e permettendo di proporre l'immobile via WhatsApp con un clic. " +
  "Estrae in forma strutturata i dati catastali da visure, planimetrie, atti di provenienza e attestati di prestazione energetica, evidenziando difformita' e documenti mancanti. " +
  "Genera annunci per i portali, post per i social network e script per video brevi, e produce il feed XML per la pubblicazione automatica. " +
  "Trasforma le note vocali registrate dopo una visita in report professionali per i proprietari degli immobili. " +
  "Gestisce gli incarichi di mediazione con tipo di mandato, scadenza, provvigione e ubicazione delle chiavi, escludendo automaticamente dai portali gli immobili con incarico scaduto. " +
  "Il servizio e' rivolto ad agenzie immobiliari e agenti immobiliari che operano in Italia, con gestione dei ruoli fra titolare e collaboratori. " +
  "Database e server principali sono situati nell'Unione Europea (Francoforte) e il trattamento e' conforme al GDPR. " +
  "E' disponibile un piano di prova gratuito che non richiede carta di credito. " +
  `I piani a pagamento possono essere fatturati mensilmente oppure annualmente, con uno sconto del ${YEARLY_DISCOUNT_LABEL} sulla fatturazione annuale.`;

/**
 * Offerte dei piani in formato Schema.org, derivate da lib/plans.ts.
 *
 * Ogni piano a pagamento genera due offerte, mensile e annuale, con lo stesso
 * sconto applicato in pagina: dichiarare solo il mensile farebbe apparire nei
 * risultati un prezzo diverso da quello effettivamente proposto a chi sceglie
 * la fatturazione annuale.
 */
function buildOffers() {
  return Object.values(PLANS).flatMap((plan) => {
    if (plan.priceEurMonthly === null) {
      return [
        {
          "@type": "Offer",
          name: `Piano ${plan.name}`,
          price: "0",
          priceCurrency: "EUR",
          category: "free",
          url: `${SITE_URL}/register`,
          availability: "https://schema.org/InStock",
        },
      ];
    }

    const yearly = getPlanPricing(plan, "yearly");

    return [
      {
        "@type": "Offer",
        name: `Piano ${plan.name}, fatturazione mensile`,
        price: String(plan.priceEurMonthly),
        priceCurrency: "EUR",
        category: "subscription",
        url: `${SITE_URL}/register`,
        availability: "https://schema.org/InStock",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: String(plan.priceEurMonthly),
          priceCurrency: "EUR",
          billingDuration: 1,
          billingIncrement: 1,
          unitCode: "MON",
        },
      },
      {
        "@type": "Offer",
        name: `Piano ${plan.name}, fatturazione annuale`,
        price: String(yearly.chargedAmount),
        priceCurrency: "EUR",
        category: "subscription",
        url: `${SITE_URL}/register`,
        availability: "https://schema.org/InStock",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: String(yearly.chargedAmount),
          priceCurrency: "EUR",
          billingDuration: 12,
          billingIncrement: 1,
          unitCode: "MON",
        },
      },
    ];
  });
}

/**
 * Dati strutturati della landing.
 *
 * Il tipo del prodotto è `SoftwareApplication`, non `RealEstateAgent`:
 * quest'ultimo dichiarerebbe che PropertyTech *è* un'agenzia immobiliare, e i
 * crawler generativi lo catalogherebbero fra i concorrenti dei clienti anziché
 * fra i fornitori di software. Il legame con il settore è espresso da
 * `audience` e `Organization.knowsAbout`, che è la forma semanticamente corretta.
 */
export function buildStructuredData() {
  const organization = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: BRAND.name,
    url: SITE_URL,
    logo: `${SITE_URL}/opengraph-image`,
    description: GEO_DESCRIPTION,
    areaServed: { "@type": "Country", name: "Italia" },
    knowsAbout: [
      "automazione per agenzie immobiliari",
      "qualificazione dei lead immobiliari",
      "estrazione dati da visure catastali",
      "generazione di annunci immobiliari",
      "reportistica per proprietari di immobili",
    ],
  };

  const softwareApplication = {
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#software`,
    name: BRAND.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "RealEstateSoftware",
    operatingSystem: "Web",
    url: SITE_URL,
    description: GEO_DESCRIPTION,
    inLanguage: "it-IT",
    publisher: { "@id": `${SITE_URL}/#organization` },
    offers: buildOffers(),
    audience: {
      "@type": "BusinessAudience",
      name: "Agenzie immobiliari e agenti immobiliari in Italia",
      audienceType: "Real Estate Agency",
    },
    featureList: [
      "Qualificazione automatica dei lead via WhatsApp 24 ore su 24",
      "Matchmaking bidirezionale fra lead qualificati e portafoglio immobili",
      "Trascrizione automatica delle note vocali ricevute dai clienti",
      "Estrazione dati da visure catastali, atti, planimetrie e APE",
      "Generazione di annunci per portali immobiliari e post social",
      "Feed XML per la pubblicazione automatica sui portali immobiliari",
      "Gestione degli incarichi di mediazione con avviso di scadenza",
      "Report post-visita per i proprietari a partire da note vocali",
      "Gestione delle agende e degli appuntamenti di visita",
      "Gestione del team con ruoli distinti fra titolare e collaboratori",
    ],
  };

  // Rispecchia esattamente l'accordion della landing (lib/faq.ts).
  // Google richiede che ogni coppia domanda/risposta presente nel markup
  // FAQPage sia visibile in pagina: aggiungere qui domande "solo strutturate"
  // farebbe scartare il rich result. Le informazioni di inquadramento generale
  // (cos'è il prodotto, da quali portali arrivano i lead) restano coperte da
  // GEO_DESCRIPTION e da `featureList` su SoftwareApplication.
  const faq = {
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return {
    "@context": "https://schema.org",
    "@graph": [organization, softwareApplication, faq],
  };
}

/**
 * Metadati di una pagina pubblica secondaria.
 *
 * # Perché serve un helper e non cinque blocchi scritti a mano
 *
 * In Next.js `openGraph` **non eredita** il `title` e la `description` che la
 * pagina dichiara: se il layout ne definisce uno, la pagina che non lo
 * sovrascrive tiene quello del layout per intero. Il risultato è che ogni
 * sottopagina condivisa su WhatsApp o LinkedIn si presentava con titolo,
 * descrizione e URL della home — compresa la guida, che è la pagina che
 * risponde alle domande d'uso e che i motori generativi citano più volentieri.
 *
 * Vale lo stesso per `alternates.canonical`: il layout ne dichiara uno su "/",
 * e una pagina che lo eredita sta dicendo a Google di essere un duplicato
 * della home, cioè di non meritare un posto nell'indice.
 *
 * Tenere le tre cose insieme — canonical, OpenGraph e Twitter, tutte derivate
 * dallo stesso `path` — evita che la prossima pagina pubblica ne dimentichi
 * una: sono errori invisibili in pagina e visibili solo mesi dopo, quando la
 * pagina non si posiziona.
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: `/${string}`;
}): Metadata {
  const url = `${SITE_URL}${path}`;
  // Il titolo completo di OpenGraph: `template` del layout agisce solo su
  // `title`, non sulle anteprime social, che quindi lo perderebbero.
  const titoloEsteso = `${title} — ${BRAND.name}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      locale: "it_IT",
      siteName: BRAND.name,
      title: titoloEsteso,
      description,
      url,
    },
    twitter: { card: "summary_large_image", title: titoloEsteso, description },
  };
}
