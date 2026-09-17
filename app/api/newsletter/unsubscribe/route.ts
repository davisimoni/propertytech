import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/seo";
import { verificaDisiscrizione } from "@/lib/newsletter/unsubscribe-token";

/**
 * Disiscrizione dalla newsletter, senza login.
 *
 * - **POST in un clic** (RFC 8058): è la richiesta che Gmail, Yahoo e Apple
 *   Mail inviano quando si preme "Annulla iscrizione" accanto al mittente, con
 *   il corpo `List-Unsubscribe=One-Click`. Risponde 200 senza pagine.
 * - **POST dal modulo della pagina** (`?origine=pagina`): stesso effetto, poi
 *   torna alla pagina con la conferma.
 * - **GET**: non disiscrive. Rimanda alla pagina di conferma, perché i filtri
 *   antispam aziendali aprono i link delle email per controllarli e
 *   disiscriverebbero persone che non l'hanno chiesto.
 *
 * Tocca solo `newsletterOptOutAt`: le email di servizio non lo leggono.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const userId = verificaDisiscrizione(token);
  const dallaPagina = url.searchParams.get("origine") === "pagina";

  if (!userId) {
    if (dallaPagina) {
      return NextResponse.redirect(`${SITE_URL}/newsletter/disiscrizione?esito=non-valido`, 303);
    }
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  // `updateMany` con `newsletterOptOutAt: null`: una seconda richiesta non
  // sposta la data della prima, e un utente eliminato non genera un errore.
  await prisma.user.updateMany({
    where: { id: userId, newsletterOptOutAt: null },
    data: { newsletterOptOutAt: new Date() },
  });

  console.info("[NEWSLETTER-UNSUBSCRIBE]", { userId, origine: dallaPagina ? "pagina" : "un-clic" });

  if (dallaPagina) {
    return NextResponse.redirect(`${SITE_URL}/newsletter/disiscrizione?esito=ok`, 303);
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return NextResponse.redirect(
    `${SITE_URL}/newsletter/disiscrizione?token=${encodeURIComponent(token)}`,
    303
  );
}
