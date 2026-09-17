import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/seo";
import {
  cancellaDatiFacebook,
  segretoVerifica,
  verificaSignedRequest,
} from "@/lib/social/data-deletion";

/**
 * Data Deletion Callback di Meta.
 *
 * Meta chiama questo indirizzo quando una persona rimuove l'app dalle proprie
 * impostazioni Facebook, e si aspetta una risposta con l'indirizzo dove
 * verificare lo stato e un codice di conferma:
 *
 *   { "url": "...", "confirmation_code": "..." }
 *
 * # Perché la firma viene prima di tutto
 *
 * Il corpo contiene l'id di un utente Facebook. Senza verificare la firma con
 * l'App Secret, chiunque potrebbe far cancellare il collegamento di
 * un'agenzia inviando un id: la firma è l'unica prova che la richiesta
 * provenga da Meta.
 *
 * # Perché la cancellazione avviene subito
 *
 * Perché è breve — una riga di collegamento — e perché un codice di conferma
 * che rimanda a un lavoro non ancora fatto costringerebbe a gestire uno stato
 * "in corso" senza nessun vantaggio per chi ha chiesto la cancellazione.
 */

export const dynamic = "force-dynamic";

/** Meta invia `application/x-www-form-urlencoded`; alcuni strumenti di prova usano JSON. */
async function leggiSignedRequest(request: Request): Promise<string | null> {
  const tipo = request.headers.get("content-type") ?? "";

  if (tipo.includes("application/json")) {
    const corpo = (await request.json().catch(() => null)) as { signed_request?: string } | null;
    return corpo?.signed_request ?? null;
  }

  const testo = await request.text();
  return new URLSearchParams(testo).get("signed_request");
}

export async function POST(request: Request) {
  const appSecret = segretoVerifica();
  if (!appSecret) {
    console.error("[api/auth/facebook/data-deletion] META_APP_SECRET assente: rotta chiusa.");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const signedRequest = await leggiSignedRequest(request);
  if (!signedRequest) {
    return NextResponse.json({ error: "missing_signed_request" }, { status: 400 });
  }

  const richiesta = verificaSignedRequest(signedRequest, appSecret);
  if (!richiesta) {
    console.warn("[api/auth/facebook/data-deletion] Richiesta con firma non valida: ignorata.");
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const esito = await cancellaDatiFacebook(richiesta.userId);

  return NextResponse.json({
    url: `${SITE_URL}/data-deletion-status?id=${esito.code}`,
    confirmation_code: esito.code,
  });
}

/**
 * `GET` per chi apre l'indirizzo dal pannello Meta o dal browser: spiega cosa
 * sia, invece di un 405 che sembra un guasto.
 */
export function GET() {
  return NextResponse.json({
    endpoint: "Data Deletion Callback di Meta",
    metodo: "POST con signed_request",
    istruzioni: `${SITE_URL}/data-deletion`,
  });
}
