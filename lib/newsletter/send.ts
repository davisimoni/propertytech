import "server-only";
import { Prisma, type NewsletterCampaign } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/seo";
import { formatEur } from "@/lib/plans";
import { getUsageStats } from "@/lib/usage";
import { escapeHtml, renderEmail, renderEmailText, type EmailLayoutInput } from "@/lib/email/layout";
import { isEmailConfigured, sendEmail, type EmailOutcome } from "@/lib/notifications/email";
import { numeroPerChiave, numeroPerSequenza, type NumeroNewsletter } from "./editorial";
import { upsellPer, type DatiUpsell } from "./upsell";
import {
  firmaDisiscrizione,
  urlDisiscrizioneUnClic,
  urlPaginaDisiscrizione,
} from "./unsubscribe-token";

/**
 * Invio della newsletter: martedì e giovedì.
 *
 * # Destinatari
 *
 * Tutti gli utenti con accesso attivo (`acceptedAt` valorizzato), Trial
 * compresi, che non si sono disiscritti. Gli inviti non ancora accettati no:
 * quell'indirizzo non ha ancora dimostrato di appartenere a qualcuno.
 *
 * # Idempotenza e ripresa
 *
 * - Una campagna per giorno (`sendDate` unico): una seconda chiamata nello
 *   stesso giorno riprende la stessa campagna.
 * - Una consegna per persona (`[campaignId, userId]` unico), prenotata PRIMA
 *   dell'invio: due esecuzioni parallele non mandano due copie.
 * - Limite di tempo: oltre `scadenzaMs` il giro si ferma e la campagna resta
 *   aperta; la completa il controllo giornaliero (`riprendiNewsletterInSospeso`).
 *
 * # Separata dalle email di servizio
 *
 * Passa `unsubscribeUrl` al trasporto, che per questo la tratta come marketing
 * (mittente dedicato se configurato, intestazioni di disiscrizione). Le email
 * di servizio non leggono `newsletterOptOutAt` e non passano mai di qui.
 */

export const GIORNI_INVIO = [2, 4]; // martedì, giovedì (0 = domenica)
const SCADENZA_PREDEFINITA_MS = 45_000;
const GIORNI_RIPRESA = 3;

const PARTI_DATA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});
const GIORNI: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Data e giorno della settimana in Italia, non in UTC: la newsletter è per l'Italia. */
export function dataItaliana(adesso: Date): { data: string; giornoSettimana: number } {
  const parti = Object.fromEntries(PARTI_DATA.formatToParts(adesso).map((p) => [p.type, p.value]));
  return {
    data: `${parti.year}-${parti.month}-${parti.day}`,
    giornoSettimana: GIORNI[parti.weekday ?? ""] ?? -1,
  };
}

export interface Destinatario {
  id: string;
  email: string;
  firstName: string | null;
  role: "OWNER" | "AGENT";
  organizationId: string;
}

/** Composizione di un numero per un destinatario. Pura, per poterla provare. */
export function componiNewsletter(params: {
  numero: NumeroNewsletter;
  destinatario: Pick<Destinatario, "firstName">;
  token: string;
  upsell: DatiUpsell | null;
}): { subject: string; layout: EmailLayoutInput; unsubscribeUrl: string } {
  const { numero, destinatario, token, upsell } = params;
  const nome = destinatario.firstName?.trim();

  const layout: EmailLayoutInput = {
    heading: numero.titolo,
    preheader: numero.anteprima,
    greeting: nome ? `Buongiorno ${escapeHtml(nome)},` : "Buongiorno,",
    blocks: numero.blocchi,
    cta: { label: numero.cta.label, url: `${SITE_URL}${numero.cta.path}` },
    ...(upsell
      ? {
          upsell: {
            title: `Consumo oltre l'80%: valuta il piano ${upsell.pianoSuccessivo.name}`,
            intro: `Nel piano ${escapeHtml(upsell.pianoAttuale.name)} hai superato l'80% di: ${upsell.contatori.map(escapeHtml).join(", ")}. Il piano ${escapeHtml(upsell.pianoSuccessivo.name)}${upsell.pianoSuccessivo.priceEurMonthly ? ` (${formatEur(upsell.pianoSuccessivo.priceEurMonthly)} al mese)` : ""} comprende:`,
            items: upsell.vantaggi.map(escapeHtml),
            cta: { label: `Passa a ${upsell.pianoSuccessivo.name}`, url: `${SITE_URL}/settings?tab=billing` },
          },
        }
      : {}),
    footer: {
      tipo: "newsletter",
      unsubscribeUrl: urlPaginaDisiscrizione(token),
      preferencesUrl: `${SITE_URL}/settings?tab=privacy`,
    },
  };

  return { subject: numero.oggetto, layout, unsubscribeUrl: urlDisiscrizioneUnClic(token) };
}

async function destinatariMancanti(
  campaignId: string,
  soloOrganizzazioni?: string[]
): Promise<Destinatario[]> {
  return prisma.user.findMany({
    where: {
      ...(soloOrganizzazioni ? { organizationId: { in: soloOrganizzazioni } } : {}),
      acceptedAt: { not: null },
      newsletterOptOutAt: null,
      newsletterDeliveries: { none: { campaignId } },
    },
    select: { id: true, email: true, firstName: true, role: true, organizationId: true },
    orderBy: { createdAt: "asc" },
  });
}

export interface EsitoCampagna {
  campagna: string;
  numero: string;
  inviati: number;
  falliti: number;
  conUpsell: number;
  rimanenti: number;
  completata: boolean;
}

async function completaCampagna(
  campagna: NewsletterCampaign,
  scadenzaMs: number,
  soloOrganizzazioni?: string[]
): Promise<EsitoCampagna> {
  const inizio = Date.now();
  const numero = numeroPerChiave(campagna.issueKey) ?? numeroPerSequenza(campagna.sequence);
  const destinatari = await destinatariMancanti(campagna.id, soloOrganizzazioni);

  // Statistiche per agenzia, una volta sola: più titolari della stessa agenzia
  // non ricalcolano lo stesso consumo.
  const statistiche = new Map<string, Awaited<ReturnType<typeof getUsageStats>> | null>();

  let inviati = 0;
  let falliti = 0;
  let conUpsell = 0;
  let elaborati = 0;

  for (const destinatario of destinatari) {
    if (Date.now() - inizio > scadenzaMs) break;
    elaborati += 1;

    const token = firmaDisiscrizione(destinatario.id);
    if (!token) {
      // Senza segreto non si può offrire la disiscrizione: meglio non inviare
      // affatto che mandare una newsletter senza via d'uscita.
      console.error("[newsletter] Segreto di firma assente: invio interrotto");
      break;
    }

    // Prenotazione: se un'altra esecuzione ha già preso questo destinatario,
    // la create viola il vincolo e si passa oltre.
    let consegnaId: string;
    try {
      const consegna = await prisma.newsletterDelivery.create({
        data: { campaignId: campagna.id, userId: destinatario.id },
        select: { id: true },
      });
      consegnaId = consegna.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }

    let upsell: DatiUpsell | null = null;
    if (destinatario.role === "OWNER") {
      if (!statistiche.has(destinatario.organizationId)) {
        statistiche.set(
          destinatario.organizationId,
          await getUsageStats(destinatario.organizationId).catch(() => null)
        );
      }
      const stats = statistiche.get(destinatario.organizationId);
      upsell = stats ? upsellPer(stats, destinatario.role) : null;
    }

    const { subject, layout, unsubscribeUrl } = componiNewsletter({
      numero,
      destinatario,
      token,
      upsell,
    });

    let outcome: EmailOutcome;
    try {
      outcome = await sendEmail({
        to: destinatario.email,
        subject,
        text: renderEmailText(layout),
        html: renderEmail(layout),
        unsubscribeUrl,
      });
    } catch {
      outcome = "failed";
    }

    await prisma.newsletterDelivery.update({
      where: { id: consegnaId },
      data: { outcome, upsell: upsell !== null },
    });

    if (outcome === "sent") inviati += 1;
    else falliti += 1;
    if (upsell) conUpsell += 1;
  }

  const rimanenti = destinatari.length - elaborati;
  // Un invio limitato ad alcune organizzazioni non chiude la campagna: gli
  // altri destinatari non sono stati nemmeno considerati.
  const completata = rimanenti === 0 && !soloOrganizzazioni;
  if (completata && !campagna.completedAt) {
    await prisma.newsletterCampaign.update({
      where: { id: campagna.id },
      data: { completedAt: new Date() },
    });
  }

  const esito: EsitoCampagna = {
    campagna: campagna.sendDate,
    numero: numero.key,
    inviati,
    falliti,
    conUpsell,
    rimanenti,
    completata,
  };
  console.info("[NEWSLETTER]", esito);
  return esito;
}

async function campagnaDelGiorno(data: string): Promise<NewsletterCampaign> {
  const esistente = await prisma.newsletterCampaign.findUnique({ where: { sendDate: data } });
  if (esistente) return esistente;

  const ultima = await prisma.newsletterCampaign.findFirst({
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const sequence = (ultima?.sequence ?? -1) + 1;
  const numero = numeroPerSequenza(sequence);

  try {
    return await prisma.newsletterCampaign.create({
      data: { sendDate: data, sequence, issueKey: numero.key, pillar: numero.pilastro },
    });
  } catch (error) {
    // Due esecuzioni simultanee: una crea, l'altra rilegge quella creata.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const creata = await prisma.newsletterCampaign.findUnique({ where: { sendDate: data } });
      if (creata) return creata;
    }
    throw error;
  }
}

export type EsitoNewsletter =
  | { stato: "non_configurato" }
  | { stato: "giorno_non_previsto"; giorno: string }
  | ({ stato: "eseguita" } & EsitoCampagna);

/**
 * Invio del giorno. `forza` salta il controllo del giorno della settimana:
 * serve solo per una prova manuale, e la rotta la accetta solo con il segreto
 * dello scheduler.
 */
export async function inviaNewsletter(options?: {
  adesso?: Date;
  scadenzaMs?: number;
  forza?: boolean;
  /**
   * Limita l'invio a queste organizzazioni. Non esposto dalla rotta: serve a
   * provare un numero su agenzie di test senza toccare gli utenti reali.
   */
  soloOrganizzazioni?: string[];
}): Promise<EsitoNewsletter> {
  // Senza fornitore configurato non si crea nemmeno la campagna: altrimenti
  // ogni consegna risulterebbe registrata e, configurata la posta, nessuno
  // riceverebbe il numero del giorno.
  if (!isEmailConfigured()) return { stato: "non_configurato" };

  const adesso = options?.adesso ?? new Date();
  const { data, giornoSettimana } = dataItaliana(adesso);
  if (!options?.forza && !GIORNI_INVIO.includes(giornoSettimana)) {
    return { stato: "giorno_non_previsto", giorno: data };
  }

  const campagna = await campagnaDelGiorno(data);
  const esito = await completaCampagna(
    campagna,
    options?.scadenzaMs ?? SCADENZA_PREDEFINITA_MS,
    options?.soloOrganizzazioni
  );
  return { stato: "eseguita", ...esito };
}

/** Completa le campagne recenti rimaste a metà. Chiamata dal controllo giornaliero. */
export async function riprendiNewsletterInSospeso(
  adesso: Date = new Date()
): Promise<EsitoCampagna[] | { stato: "non_configurato" }> {
  if (!isEmailConfigured()) return { stato: "non_configurato" };

  const aperte = await prisma.newsletterCampaign.findMany({
    where: {
      completedAt: null,
      createdAt: { gte: new Date(adesso.getTime() - GIORNI_RIPRESA * 86_400_000) },
    },
    orderBy: { createdAt: "asc" },
  });

  const esiti: EsitoCampagna[] = [];
  for (const campagna of aperte) {
    esiti.push(await completaCampagna(campagna, SCADENZA_PREDEFINITA_MS));
  }
  return esiti;
}
