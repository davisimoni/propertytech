import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  clientIp,
  evaluateRateLimit,
  hashIp,
  windowStart,
} from "@/lib/contact/rate-limit";

/**
 * Modulo di contatto della landing pubblica.
 *
 * Rotta senza autenticazione, quindi raggiungibile da chiunque: i limiti sulla
 * dimensione dei campi e sul numero di invii sono l'unica cosa che la separa da
 * un modulo di spam. Nessun dato di sessione viene letto qui — non c'è.
 */

const contactSchema = z.object({
  firstName: z.string({ error: "Inserisci il tuo nome" }).trim().min(2, "Inserisci il tuo nome").max(60),
  lastName: z.string({ error: "Inserisci il tuo cognome" }).trim().min(2, "Inserisci il tuo cognome").max(60),
  email: z
    .string({ error: "Inserisci la tua email" })
    .trim()
    .toLowerCase()
    .email("Controlla l'indirizzo email")
    .max(200),
  phone: z
    .string({ error: "Inserisci un numero di telefono" })
    .trim()
    .min(6, "Inserisci un numero di telefono valido")
    .max(30)
    // Cifre, spazi e i separatori che la gente usa davvero scrivendo un numero.
    .regex(/^[+\d][\d\s().\-/]*$/, "Il telefono può contenere solo cifre e i simboli + ( ) - ."),
  // Facoltativo: un'agenzia che chiede informazioni può non avere ancora un
  // nome da dare, e obbligarlo farebbe abbandonare il modulo.
  agencyName: z.string().trim().max(120).optional(),
  message: z
    .string({ error: "Scrivi un messaggio" })
    .trim()
    .min(10, "Scrivi qualche parola in più, così sappiamo come aiutarti")
    .max(2000),
  /**
   * Campo trappola: invisibile agli utenti, riempito dai robot che compilano
   * ogni input che trovano. Costa nulla e ferma la maggior parte degli invii
   * automatici senza chiedere un captcha a chi è in buona fede.
   */
  website: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = contactSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", message: parsed.error.issues[0]?.message ?? "Controlla i dati inseriti." },
      { status: 400 }
    );
  }

  const { firstName, lastName, email, phone, agencyName, message, website } = parsed.data;

  // Trappola scattata: si risponde come se fosse andato tutto bene. Dire al
  // robot che è stato riconosciuto gli insegnerebbe solo a evitare il campo.
  if (website) {
    console.warn("[api/contact] Honeypot compilato: invio scartato.");
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const ip = clientIp(request.headers);
  const ipHash = ip ? hashIp(ip) : null;
  const since = windowStart();

  const [recentFromIp, recentFromEmail] = await Promise.all([
    ipHash
      ? prisma.contactRequest.count({ where: { ipHash, createdAt: { gte: since } } })
      : Promise.resolve(0),
    prisma.contactRequest.count({ where: { email, createdAt: { gte: since } } }),
  ]);

  const verdict = evaluateRateLimit(recentFromIp, recentFromEmail);

  if (!verdict.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: verdict.message },
      { status: 429 }
    );
  }

  try {
    await prisma.contactRequest.create({
      data: { firstName, lastName, email, phone, agencyName: agencyName || null, message, ipHash },
    });
  } catch (error) {
    // Nessun dettaglio tecnico all'utente, e nel log niente messaggio: il testo
    // scritto da chi contatta è un dato personale e non deve finire nei log.
    console.error("[api/contact] Salvataggio non riuscito", error);
    return NextResponse.json(
      {
        error: "save_failed",
        message: "Non siamo riusciti a registrare la richiesta. Scrivici a info@propertytechsolutions.net.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
