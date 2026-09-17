import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verificaDisiscrizione } from "@/lib/newsletter/unsubscribe-token";

/**
 * Disiscrizione dalla newsletter, senza login, dal link unico di ogni numero.
 *
 * Tocca solo `User.newsletterOptOutAt`. Le email di servizio non leggono quel
 * campo (vedi `lib/email/transactional.ts`), quindi nessuna disiscrizione può
 * spegnere l'avviso di sessione WhatsApp, un lead qualificato o i crediti
 * esauriti.
 *
 * # Un clic per la persona, nessun effetto per i filtri antispam
 *
 * - **GET** (il clic sul link nel piè di pagina): NON scrive. Rimanda alla
 *   pagina `/newsletter/disiscrizione`, che esegue la disiscrizione appena si
 *   apre nel browser. Per chi clicca è un solo clic. I filtri di sicurezza
 *   aziendali (Microsoft Safe Links, Mimecast, Proofpoint) aprono invece ogni
 *   link delle email per controllarlo, senza eseguire la pagina: se il GET
 *   disiscrivesse, una newsletter arrivata in un'agenzia con quei filtri
 *   disiscriverebbe il destinatario prima che la legga.
 * - **POST in un clic** (RFC 8058): la richiesta che Gmail, Yahoo e Apple Mail
 *   inviano dal comando "Annulla iscrizione" accanto al mittente. Scrive e
 *   risponde 200.
 * - **POST `?azione=riattiva`**: annulla una disiscrizione fatta per errore,
 *   dalla stessa pagina e con lo stesso token.
 * - **POST `?origine=pagina`**: dal modulo della pagina quando JavaScript è
 *   disattivato; scrive e torna alla pagina con l'esito.
 */

/**
 * Reindirizzamento sulla stessa origine della richiesta, non su `SITE_URL`:
 * in anteprima o in locale un indirizzo assoluto porterebbe alla pagina di
 * produzione, che non ha eseguito la richiesta.
 */
function versoPagina(request: Request, query: string): NextResponse {
  return NextResponse.redirect(new URL(`/newsletter/disiscrizione?${query}`, request.url), 303);
}

async function applica(userId: string, azione: "disiscrivi" | "riattiva"): Promise<void> {
  if (azione === "riattiva") {
    await prisma.user.updateMany({ where: { id: userId }, data: { newsletterOptOutAt: null } });
  } else {
    // Solo se non lo era già: una seconda richiesta non sposta la data della
    // prima, che è la prova di quando l'opposizione è stata esercitata.
    await prisma.user.updateMany({
      where: { id: userId, newsletterOptOutAt: null },
      data: { newsletterOptOutAt: new Date() },
    });
  }
  console.info("[NEWSLETTER-UNSUBSCRIBE]", { userId, azione });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const userId = verificaDisiscrizione(token);
  const dallaPagina = url.searchParams.get("origine") === "pagina";
  const azione = url.searchParams.get("azione") === "riattiva" ? "riattiva" : "disiscrivi";

  if (!userId) {
    if (dallaPagina) {
      return versoPagina(request, "esito=non-valido");
    }
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  await applica(userId, azione);

  if (dallaPagina) {
    const esito = azione === "riattiva" ? "riattivata" : "ok";
    return versoPagina(request, `esito=${esito}&token=${encodeURIComponent(token ?? "")}`);
  }
  return NextResponse.json({ ok: true, azione });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return versoPagina(request, `token=${encodeURIComponent(token)}`);
}
