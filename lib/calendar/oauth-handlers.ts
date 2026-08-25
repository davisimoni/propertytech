import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { auth } from "@/auth";
import { isEncryptionAvailable } from "@/lib/crypto/secrets";
import { SITE_URL } from "@/lib/seo";
import {
  CALENDAR_OAUTH_PROVIDERS,
  calendarRedirectUri,
  isCalendarProviderConfigured,
  type CalendarOAuthProviderId,
} from "./oauth";
import { saveCalendarConnection } from "./connections";

/**
 * Flusso OAuth2 dei calendari esterni, condiviso da Google e Outlook.
 *
 * Le rotte `/api/calendar/google/*` e `/api/calendar/outlook/*` sono quattro
 * file sottili che delegano qui: i due fornitori differiscono solo per
 * endpoint e scope — già descritti in `oauth.ts` — e duplicare due volte la
 * gestione di stato CSRF, scambio del codice e cifratura dei token
 * significherebbe correggere ogni futuro problema in due punti, dimenticandone
 * uno.
 */

/** Il cookie di stato vive quanto basta a completare il consenso, non oltre. */
const STATE_COOKIE_MAX_AGE_SECONDS = 10 * 60;

function stateCookieName(provider: CalendarOAuthProviderId): string {
  return `pt_cal_state_${provider}`;
}

/** Dove tornare a fine flusso, con l'esito da mostrare in pagina. */
function settingsRedirect(outcome: string): NextResponse {
  return NextResponse.redirect(`${SITE_URL}/settings/calendar?calendar=${outcome}`);
}

/**
 * Avvia il consenso: genera lo stato anti-CSRF, lo deposita in un cookie
 * `httpOnly` e reindirizza al fornitore.
 *
 * Senza lo stato l'endpoint di callback accetterebbe un `code` procurato da
 * chiunque: basterebbe indurre un agente autenticato ad aprire un link
 * costruito ad arte per collegare alla sua agenzia il calendario
 * dell'attaccante — e da lì leggere gli appuntamenti dei suoi clienti.
 */
export async function handleCalendarConnect(
  provider: CalendarOAuthProviderId
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isCalendarProviderConfigured(provider)) {
    return NextResponse.json(
      {
        error: "provider_not_configured",
        message: `${CALENDAR_OAUTH_PROVIDERS[provider].name} non è configurato su questo ambiente.`,
      },
      { status: 503 }
    );
  }

  // Verificata *prima* di mandare l'agente dal fornitore: completare il
  // consenso per poi scoprire che il token non è salvabile sarebbe un giro a
  // vuoto con una schermata di errore alla fine.
  if (!isEncryptionAvailable()) {
    return NextResponse.json(
      {
        error: "encryption_unavailable",
        message: "Cifratura non disponibile sul server: il collegamento non è stato avviato.",
      },
      { status: 503 }
    );
  }

  const config = CALENDAR_OAUTH_PROVIDERS[provider];
  const state = randomBytes(32).toString("base64url");

  const authorizeUrl = new URL(config.authorizeUrl);
  authorizeUrl.searchParams.set("client_id", config.clientId() as string);
  authorizeUrl.searchParams.set("redirect_uri", calendarRedirectUri(provider));
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", config.scopes.join(" "));
  authorizeUrl.searchParams.set("state", state);

  if (provider === "google") {
    // `offline` + `consent` sono ciò che fa rilasciare il refresh token a
    // Google: senza `consent` una seconda autorizzazione dello stesso account
    // non lo restituisce, e il collegamento morirebbe dopo un'ora.
    authorizeUrl.searchParams.set("access_type", "offline");
    authorizeUrl.searchParams.set("prompt", "consent");
  }

  const response = NextResponse.redirect(authorizeUrl.toString());
  response.cookies.set(stateCookieName(provider), state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}

/** Confronto a tempo costante, per non trasformare lo stato in un oracolo. */
function statesMatch(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Completa il consenso: valida lo stato, scambia il codice, salva i token cifrati. */
export async function handleCalendarCallback(
  provider: CalendarOAuthProviderId,
  request: Request
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // L'agente ha annullato dalla schermata del fornitore: non è un errore,
  // si torna in pagina senza rumore.
  if (url.searchParams.get("error")) return settingsRedirect("cancelled");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(stateCookieName(provider))?.value;

  if (!code || !state || !expectedState || !statesMatch(state, expectedState)) {
    console.error("[calendar/oauth] Stato non valido o codice mancante", { provider });
    return settingsRedirect("invalid_state");
  }

  if (!isCalendarProviderConfigured(provider)) return settingsRedirect("not_configured");

  const config = CALENDAR_OAUTH_PROVIDERS[provider];

  try {
    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId() as string,
        client_secret: config.clientSecret() as string,
        code,
        grant_type: "authorization_code",
        redirect_uri: calendarRedirectUri(provider),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!tokenResponse.ok) {
      console.error("[calendar/oauth] Scambio codice fallito", {
        provider,
        status: tokenResponse.status,
      });
      return settingsRedirect("token_exchange_failed");
    }

    const tokens: { access_token?: string; refresh_token?: string; expires_in?: number } =
      await tokenResponse.json();

    if (!tokens.access_token) return settingsRedirect("token_exchange_failed");

    // L'indirizzo serve solo a far riconoscere all'agente quale casella ha
    // collegato: se non arriva, il collegamento resta valido lo stesso.
    let accountEmail = "account collegato";
    try {
      const userInfo = await fetch(config.userInfoUrl, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (userInfo.ok) {
        accountEmail = config.readEmail(await userInfo.json()) ?? accountEmail;
      }
    } catch {
      // Vedi sopra: dato di comodo, mai motivo di fallimento.
    }

    await saveCalendarConnection({
      organizationId: session.user.organizationId,
      userId: session.user.id,
      provider,
      accountEmail,
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresInSeconds: tokens.expires_in ?? null,
      },
    });
  } catch (error) {
    console.error("[calendar/oauth] Errore nel completamento del collegamento", { provider, error });
    return settingsRedirect("token_exchange_failed");
  }

  const response = settingsRedirect("connected");
  // Lo stato ha esaurito il suo scopo: lasciarlo nel browser allungherebbe
  // senza motivo la finestra in cui può essere riutilizzato.
  response.cookies.delete(stateCookieName(provider));
  return response;
}
