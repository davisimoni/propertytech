import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readSecret } from "@/lib/env";
import { encryptAccessToken } from "@/lib/whatsapp/credentials";
import { getOrCreateWhatsAppConfig, toPublicWhatsAppConfig } from "@/lib/whatsapp/config-view";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_TIMEOUT_MS = 10_000;

const embeddedSignupSchema = z.object({
  code: z.string().min(10),
  phoneNumberId: z.string().min(3),
  wabaId: z.string().optional(),
});

/**
 * Completa l'Embedded Signup di Meta: scambia il `code` restituito da
 * `FB.login` con un token di accesso e collega WhatsApp senza che l'agente
 * debba mai vedere o copiare un token — il percorso guidato che sostituisce
 * il modulo manuale per chi non vuole (o non sa) procurarsi le credenziali da
 * solo. Il Phone Number ID non arriva dal `code`: lo raccoglie il browser dal
 * postMessage `WA_EMBEDDED_SIGNUP` che Meta invia durante il flusso, e lo
 * manda qui insieme (vedi `components/whatsapp/meta-connect-button.tsx`).
 *
 * Non lancia mai per un problema di rete verso Meta: risponde con un errore
 * chiaro e lascia intatta l'eventuale configurazione precedente, così un
 * tentativo fallito non lascia l'agenzia disconnessa.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const appId = readSecret("NEXT_PUBLIC_META_APP_ID");
  const appSecret = readSecret("META_APP_SECRET");

  if (!appId || !appSecret) {
    return NextResponse.json(
      {
        error: "meta_not_configured",
        message:
          "Il collegamento guidato con Meta non è configurato su questo ambiente. Usa la configurazione avanzata.",
      },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = embeddedSignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { code, phoneNumberId } = parsed.data;
  const organizationId = session.user.organizationId;

  let accessToken: string;
  try {
    const tokenUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);

    const tokenResponse = await fetch(tokenUrl, { signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS) });
    const tokenData: { access_token?: string } | null = await tokenResponse.json().catch(() => null);

    if (!tokenResponse.ok || !tokenData?.access_token) {
      console.error("[whatsapp/meta/embedded-signup] Scambio token fallito", {
        status: tokenResponse.status,
        organizationId,
      });
      return NextResponse.json(
        { error: "token_exchange_failed", message: "Meta non ha confermato il collegamento. Riprova." },
        { status: 502 }
      );
    }

    accessToken = tokenData.access_token;
  } catch (error) {
    console.error("[whatsapp/meta/embedded-signup] Errore di rete verso Meta", { organizationId, error });
    return NextResponse.json(
      { error: "token_exchange_failed", message: "Errore di rete verso Meta. Riprova." },
      { status: 502 }
    );
  }

  // Il numero mostrato in scheda arriva dalla stessa API con lo stesso
  // token: risparmia all'agente di doverlo ridigitare a mano, l'unico dato
  // che l'Embedded Signup da solo non lascia già pronto all'uso. Non
  // bloccante: senza, il collegamento resta comunque valido.
  let displayPhoneNumber: string | null = null;
  try {
    const phoneUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}`);
    phoneUrl.searchParams.set("fields", "display_phone_number");
    phoneUrl.searchParams.set("access_token", accessToken);

    const phoneResponse = await fetch(phoneUrl, { signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS) });
    const phoneData: { display_phone_number?: string } | null = await phoneResponse.json().catch(() => null);
    displayPhoneNumber = phoneData?.display_phone_number ?? null;
  } catch {
    // Vedi commento sopra: solo un dato di comodo, mai motivo di fallimento.
  }

  let encryptedToken: string;
  try {
    encryptedToken = encryptAccessToken(accessToken);
  } catch {
    return NextResponse.json(
      {
        error: "encryption_unavailable",
        message: "Cifratura non disponibile sul server: il token non è stato salvato.",
      },
      { status: 503 }
    );
  }

  await getOrCreateWhatsAppConfig(organizationId);
  const updated = await prisma.whatsAppConfig.update({
    where: { organizationId },
    data: {
      provider: "meta",
      isConnected: true,
      metaAccessToken: encryptedToken,
      metaPhoneAccountId: phoneNumberId,
      phoneNumber: displayPhoneNumber,
    },
  });

  return NextResponse.json(toPublicWhatsAppConfig(updated));
}
