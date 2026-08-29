import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveOwner } from "@/lib/email/recipients";
import { sendMandatesExpiringEmail } from "@/lib/email/transactional";
import { daysUntilExpiry, PUBLISHED_STATUSES_FOR_MANDATE } from "./mandate-scope";

/**
 * Controllo periodico degli incarichi in scadenza.
 *
 * # Perché non basta calcolarlo a video
 *
 * Lo stato dell'incarico si può derivare in qualunque momento dalla data, e la
 * scheda immobile lo fa. Ma un avviso che compare solo a chi era già andato a
 * guardare serve a chi non ne aveva bisogno: chi rischia di farsi scadere un
 * mandato è precisamente chi in quella pagina non entra da settimane.
 *
 * # Una email per agenzia, non una per immobile
 *
 * Un'agenzia con quaranta incarichi ne ha spesso diversi in scadenza nello
 * stesso mese. Un messaggio per ciascuno verrebbe archiviato in blocco; un
 * riepilogo unico, diviso per urgenza, si legge.
 */

export interface MandateCheckResult {
  organizzazioni: number;
  avvisate: number;
  schede: number;
}

/** Immobile nel riepilogo, con i giorni che mancano. */
interface Riga {
  reference: string;
  title: string;
  days: number;
}

/**
 * Esegue il controllo su tutte le agenzie. Non lancia mai.
 *
 * `now` è iniettabile per i test: un controllo che dipende dall'orologio non
 * sarebbe verificabile in modo deterministico.
 */
export async function checkExpiringMandates(now: Date = new Date()): Promise<MandateCheckResult> {
  const risultato: MandateCheckResult = { organizzazioni: 0, avvisate: 0, schede: 0 };

  // Solo gli immobili che hanno una data e che sarebbero pubblicabili: su una
  // bozza o su un venduto la scadenza dell'incarico non ha conseguenze, e
  // segnalarla sarebbe rumore.
  const immobili = await prisma.property.findMany({
    where: {
      mandateExpiration: { not: null },
      status: { in: [...PUBLISHED_STATUSES_FOR_MANDATE] },
    },
    select: {
      organizationId: true,
      reference: true,
      title: true,
      mandateExpiration: true,
    },
    orderBy: { mandateExpiration: "asc" },
  });

  const perAgenzia = new Map<string, { entro30: Riga[]; entro60: Riga[]; scaduti: Riga[] }>();

  for (const immobile of immobili) {
    const giorni = daysUntilExpiry(immobile.mandateExpiration!, now);

    // Oltre i 60 giorni non c'è nulla da dire.
    if (giorni > 60) continue;

    const gruppo =
      perAgenzia.get(immobile.organizationId) ?? { entro30: [], entro60: [], scaduti: [] };

    const riga: Riga = {
      reference: immobile.reference,
      title: immobile.title,
      days: giorni,
    };

    // Un solo secchio per immobile: chi scade fra 20 giorni sta in "entro 30"
    // e non anche in "entro 60", o comparirebbe due volte nella stessa email.
    if (giorni < 0) gruppo.scaduti.push(riga);
    else if (giorni <= 30) gruppo.entro30.push(riga);
    else gruppo.entro60.push(riga);

    perAgenzia.set(immobile.organizationId, gruppo);
  }

  risultato.organizzazioni = perAgenzia.size;

  for (const [organizationId, gruppo] of perAgenzia) {
    const totale = gruppo.entro30.length + gruppo.entro60.length + gruppo.scaduti.length;
    if (totale === 0) continue;

    try {
      const owner = await resolveOwner(organizationId);
      if (!owner) continue;

      const outcome = await sendMandatesExpiringEmail({
        to: owner.email,
        firstName: owner.firstName,
        entro30: gruppo.entro30,
        entro60: gruppo.entro60,
        scaduti: gruppo.scaduti,
      });

      risultato.avvisate++;
      risultato.schede += totale;

      console.info("[MANDATE-CHECK]", { organizationId, totale, outcome });
    } catch (error) {
      // Un'agenzia che fallisce non deve fermare le altre: il controllo gira
      // per tutte, e interromperlo alla prima lascerebbe senza avviso chi
      // viene dopo in ordine alfabetico.
      console.error("[listings/mandate-check] Avviso non inviato", {
        organizationId,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return risultato;
}
