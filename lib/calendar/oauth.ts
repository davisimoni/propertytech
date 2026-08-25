import "server-only";
import { readSecret } from "@/lib/env";
import { SITE_URL } from "@/lib/seo";

/**
 * Registro OAuth dei calendari esterni.
 *
 * Stesso principio di `lib/integrations/providers.ts` per i gestionali: qui
 * sta *come* si parla con ciascun fornitore — endpoint, scope, nomi dei campi
 * — e nient'altro. Le chiamate di calendario vere vivono negli adapter in
 * `lib/calendar/provider.ts`, che di OAuth non sanno nulla e ricevono un
 * access token già valido.
 */

export type CalendarOAuthProviderId = "google" | "outlook";

export const CALENDAR_OAUTH_PROVIDER_IDS: CalendarOAuthProviderId[] = ["google", "outlook"];

export function isCalendarOAuthProviderId(value: unknown): value is CalendarOAuthProviderId {
  return value === "google" || value === "outlook";
}

export interface CalendarOAuthProvider {
  id: CalendarOAuthProviderId;
  /** Nome mostrato nella scheda di collegamento. */
  name: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  /** Endpoint da cui leggere l'indirizzo dell'account appena collegato. */
  userInfoUrl: string;
  /** Estrae l'email dalla risposta di `userInfoUrl`, che ha forma diversa per provider. */
  readEmail: (payload: unknown) => string | null;
}

function readString(payload: unknown, ...keys: string[]): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }

  return null;
}

export const CALENDAR_OAUTH_PROVIDERS: Record<CalendarOAuthProviderId, CalendarOAuthProvider> = {
  google: {
    id: "google",
    name: "Google Calendar",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    // `calendar.events` per creare le visite, `calendar.readonly` per leggere
    // gli impegni: sono i due permessi minimi che servono, e non si chiede la
    // scrittura sull'intero calendario (`calendar`) che includerebbe anche il
    // diritto di cancellare eventi che non abbiamo creato noi.
    scopes: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
      "openid",
      "email",
    ],
    // Riusa le credenziali dell'accesso con Google se non ne sono state
    // definite di dedicate: è lo stesso progetto Google Cloud, va solo
    // abilitata la Calendar API e aggiunto il redirect URI.
    clientId: () => readSecret("GOOGLE_CALENDAR_CLIENT_ID") ?? readSecret("GOOGLE_CLIENT_ID"),
    clientSecret: () =>
      readSecret("GOOGLE_CALENDAR_CLIENT_SECRET") ?? readSecret("GOOGLE_CLIENT_SECRET"),
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    readEmail: (payload) => readString(payload, "email"),
  },
  outlook: {
    id: "outlook",
    name: "Microsoft Outlook / Office 365",
    // `common` accetta sia account aziendali (Office 365) sia personali
    // (outlook.com): un tenant specifico escluderebbe metà delle agenzie.
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    // `offline_access` è ciò che fa rilasciare il refresh token: senza, il
    // collegamento smetterebbe di funzionare dopo un'ora e l'agente dovrebbe
    // riautorizzare a ogni sessione.
    scopes: ["offline_access", "Calendars.ReadWrite", "User.Read", "openid", "email"],
    clientId: () => readSecret("MICROSOFT_CLIENT_ID"),
    clientSecret: () => readSecret("MICROSOFT_CLIENT_SECRET"),
    userInfoUrl: "https://graph.microsoft.com/v1.0/me",
    readEmail: (payload) => readString(payload, "mail", "userPrincipalName"),
  },
};

/** Vero quando il provider ha entrambe le credenziali configurate su questo ambiente. */
export function isCalendarProviderConfigured(id: CalendarOAuthProviderId): boolean {
  const provider = CALENDAR_OAUTH_PROVIDERS[id];
  return Boolean(provider.clientId() && provider.clientSecret());
}

/**
 * Redirect URI registrato presso il fornitore.
 *
 * Derivato da `SITE_URL` e non da `request.url`: l'URI deve coincidere
 * carattere per carattere con quello registrato nella console del fornitore,
 * e ricavarlo dalla richiesta lo farebbe cambiare fra dominio di produzione,
 * anteprime di deploy e localhost — con un errore `redirect_uri_mismatch`
 * incomprensibile per chi sta solo cercando di collegare l'agenda.
 */
export function calendarRedirectUri(id: CalendarOAuthProviderId): string {
  return `${SITE_URL}/api/calendar/${id}/callback`;
}
