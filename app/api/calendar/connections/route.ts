import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  deleteCalendarConnection,
  listCalendarConnections,
} from "@/lib/calendar/connections";
import {
  CALENDAR_OAUTH_PROVIDER_IDS,
  isCalendarOAuthProviderId,
  isCalendarProviderConfigured,
  type CalendarOAuthProviderId,
} from "@/lib/calendar/oauth";

export interface CalendarConnectionView {
  provider: CalendarOAuthProviderId;
  /** Il fornitore è utilizzabile su questo ambiente (credenziali presenti). */
  isConfigured: boolean;
  /** `null` quando l'agente non ha collegato quel calendario. */
  accountEmail: string | null;
}

export interface CalendarConnectionsResponse {
  connections: CalendarConnectionView[];
}

/** Stato dei calendari esterni dell'agente autenticato. Non espone mai i token. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const connected = await listCalendarConnections(session.user.id);

  const response: CalendarConnectionsResponse = {
    connections: CALENDAR_OAUTH_PROVIDER_IDS.map((provider) => ({
      provider,
      isConfigured: isCalendarProviderConfigured(provider),
      accountEmail: connected.find((item) => item.provider === provider)?.accountEmail ?? null,
    })),
  };

  return NextResponse.json(response);
}

/** Scollega un calendario: cancella i token cifrati di quell'agente. */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const provider = new URL(request.url).searchParams.get("provider");
  if (!isCalendarOAuthProviderId(provider)) {
    return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
  }

  // Filtrato sull'utente della sessione: un id di connessione altrui non è
  // nemmeno accettato come parametro, quindi non c'è modo di scollegare il
  // calendario di un collega.
  await deleteCalendarConnection(session.user.id, provider);

  return NextResponse.json({ success: true });
}
