import "server-only";
import type { CalendarConnection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, isEncryptionAvailable } from "@/lib/crypto/secrets";
import {
  CALENDAR_OAUTH_PROVIDERS,
  isCalendarOAuthProviderId,
  type CalendarOAuthProviderId,
} from "./oauth";

/**
 * Confine di cifratura dei token dei calendari esterni.
 *
 * Unico punto in cui un token di `CalendarConnection` viene cifrato o
 * decifrato, per lo stesso motivo di `lib/whatsapp/credentials.ts`:
 * sparpagliare `decryptSecret` sui punti di lettura significa che al
 * successivo qualcuno dimentica. Qui dentro sta anche il rinnovo, perché un
 * chiamante che ottiene un access token deve poterlo usare senza chiedersi se
 * è ancora valido.
 */

/** Margine di sicurezza: si rinnova prima della scadenza, non allo scadere. */
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

const ENCRYPTED_PREFIX = "enc.v1.";

function encryptToken(plaintext: string): string {
  if (!isEncryptionAvailable()) {
    throw new Error("Cifratura non disponibile: definisci ENCRYPTION_KEY o NEXTAUTH_SECRET.");
  }
  return encryptSecret(plaintext);
}

/**
 * Un valore **non cifrato viene rifiutato**, non usato come ripiego: altrimenti
 * la protezione sarebbe aggirabile ripristinando un backup precedente alla
 * cifratura. Stessa scelta di `lib/whatsapp/credentials.ts`.
 */
function decryptToken(stored: string | null | undefined): string | null {
  if (!stored) return null;

  if (!stored.startsWith(ENCRYPTED_PREFIX)) {
    console.warn("[calendar/connections] Token non cifrato ignorato: ricollegare il calendario.");
    return null;
  }

  return decryptSecret(stored);
}

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string | null;
  /** Secondi di validità dichiarati dal fornitore. */
  expiresInSeconds?: number | null;
}

/**
 * Salva (o aggiorna) il collegamento di un agente a un calendario esterno.
 *
 * Il refresh token è opzionale in aggiornamento **di proposito**: Google lo
 * rilascia solo alla prima autorizzazione, e riautorizzando manda solo
 * l'access token. Sovrascriverlo con `null` a ogni riconnessione romperebbe
 * il rinnovo automatico proprio per gli agenti più diligenti, che ricollegano
 * l'agenda quando qualcosa non torna.
 */
export async function saveCalendarConnection(params: {
  organizationId: string;
  userId: string;
  provider: CalendarOAuthProviderId;
  accountEmail: string;
  tokens: StoredTokens;
}): Promise<void> {
  const { organizationId, userId, provider, accountEmail, tokens } = params;

  const expiresAt = tokens.expiresInSeconds
    ? new Date(Date.now() + tokens.expiresInSeconds * 1000)
    : null;

  const encryptedRefresh = tokens.refreshToken ? encryptToken(tokens.refreshToken) : undefined;

  await prisma.calendarConnection.upsert({
    where: { userId_provider: { userId, provider } },
    create: {
      organizationId,
      userId,
      provider,
      accountEmail,
      accessToken: encryptToken(tokens.accessToken),
      refreshToken: encryptedRefresh ?? null,
      expiresAt,
    },
    update: {
      organizationId,
      accountEmail,
      accessToken: encryptToken(tokens.accessToken),
      ...(encryptedRefresh ? { refreshToken: encryptedRefresh } : {}),
      expiresAt,
    },
  });
}

/** Collegamenti dell'agente, senza mai esporre i token. */
export async function listCalendarConnections(userId: string): Promise<
  Array<{ provider: CalendarOAuthProviderId; accountEmail: string; connectedAt: string }>
> {
  const connections = await prisma.calendarConnection.findMany({
    where: { userId },
    select: { provider: true, accountEmail: true, createdAt: true },
  });

  return connections.flatMap((connection) =>
    isCalendarOAuthProviderId(connection.provider)
      ? [
          {
            provider: connection.provider,
            accountEmail: connection.accountEmail,
            connectedAt: connection.createdAt.toISOString(),
          },
        ]
      : []
  );
}

export async function deleteCalendarConnection(
  userId: string,
  provider: CalendarOAuthProviderId
): Promise<void> {
  // `deleteMany` e non `delete`: disconnettere un calendario già disconnesso
  // non è un errore da propagare all'interfaccia.
  await prisma.calendarConnection.deleteMany({ where: { userId, provider } });
}

/**
 * Rinnova l'access token con il refresh token, aggiornando la riga.
 *
 * Restituisce `null` quando il rinnovo non è possibile: manca il refresh
 * token, oppure il fornitore lo ha invalidato (l'agente ha revocato l'accesso
 * dal proprio account Google/Microsoft). In quel caso il collegamento va
 * rifatto, e chiamare l'API con un token scaduto darebbe solo un 401 opaco.
 */
async function refreshAccessToken(connection: CalendarConnection): Promise<string | null> {
  if (!isCalendarOAuthProviderId(connection.provider)) return null;

  const provider = CALENDAR_OAUTH_PROVIDERS[connection.provider];
  const clientId = provider.clientId();
  const clientSecret = provider.clientSecret();
  const refreshToken = decryptToken(connection.refreshToken);

  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const response = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error("[calendar/connections] Rinnovo token fallito", {
        provider: connection.provider,
        status: response.status,
      });
      return null;
    }

    const data: { access_token?: string; expires_in?: number; refresh_token?: string } =
      await response.json();

    if (!data.access_token) return null;

    await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: encryptToken(data.access_token),
        // Microsoft ruota il refresh token a ogni rinnovo: ignorarlo
        // significherebbe conservare quello vecchio e trovarlo invalido al
        // giro successivo.
        ...(data.refresh_token ? { refreshToken: encryptToken(data.refresh_token) } : {}),
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
      },
    });

    return data.access_token;
  } catch (error) {
    console.error("[calendar/connections] Errore di rete nel rinnovo token", {
      provider: connection.provider,
      error,
    });
    return null;
  }
}

export interface UsableCalendarConnection {
  provider: CalendarOAuthProviderId;
  accessToken: string;
  calendarId: string;
  accountEmail: string;
}

/**
 * Collegamento pronto all'uso per un agente: token valido, già rinnovato se
 * stava per scadere.
 *
 * `null` quando non c'è un calendario collegato o quando il collegamento non è
 * più utilizzabile. Chi chiama deve trattare i due casi allo stesso modo —
 * si prosegue senza calendario esterno — perché un'agenda non sincronizzata
 * non deve impedire di fissare un appuntamento.
 */
export async function getUsableConnection(
  userId: string,
  provider?: CalendarOAuthProviderId
): Promise<UsableCalendarConnection | null> {
  const connection = await prisma.calendarConnection.findFirst({
    where: { userId, ...(provider ? { provider } : {}) },
    orderBy: { updatedAt: "desc" },
  });

  if (!connection || !isCalendarOAuthProviderId(connection.provider)) return null;

  const isExpired =
    connection.expiresAt !== null &&
    connection.expiresAt.getTime() - REFRESH_MARGIN_MS <= Date.now();

  const accessToken = isExpired
    ? await refreshAccessToken(connection)
    : decryptToken(connection.accessToken);

  if (!accessToken) return null;

  return {
    provider: connection.provider,
    accessToken,
    calendarId: connection.calendarId,
    accountEmail: connection.accountEmail,
  };
}
