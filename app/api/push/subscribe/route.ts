import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isEndpointPushAmmesso } from "@/lib/push/endpoint";

/**
 * Iscrizione di un dispositivo alle notifiche push, per l'utente collegato.
 *
 * - `POST`: salva o aggiorna l'iscrizione (`PushSubscription.toJSON()` del
 *   browser). Se l'endpoint esisteva per un altro utente — telefono condiviso,
 *   cambio di account — passa all'utente attuale: il dispositivo riceve per
 *   chi lo sta usando adesso, non per chi lo usava prima.
 * - `DELETE`: revoca. Rimuove l'iscrizione di questo dispositivo se appartiene
 *   all'utente collegato, OPPURE — anche senza sessione — se la richiesta
 *   porta il segreto `auth` dell'iscrizione. Quel segreto lo conosce solo il
 *   dispositivo iscritto, ed è ciò che permette di revocare quando la sessione
 *   non c'è più: dopo un logout, dal service worker che rinnova l'iscrizione,
 *   o alla riapertura dell'app dopo che l'utente ha bloccato le notifiche dal
 *   browser (`lib/push/device.ts`). Revocare un consenso non deve dipendere
 *   dall'essere ancora collegati.
 */

const iscrizioneSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(16).max(200),
    auth: z.string().min(8).max(100),
  }),
});

const rimozioneSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ auth: z.string().min(8).max(100) }).partial().optional(),
});

/** Descrizione breve del dispositivo, per riconoscerlo in un elenco. */
function descriviDispositivo(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const sistema = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iPod/.test(userAgent)
      ? "iOS"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "sistema sconosciuto";
  return `${browser} su ${sistema}`;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = iscrizioneSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { endpoint, keys } = parsed.data;
  if (!isEndpointPushAmmesso(endpoint)) {
    return NextResponse.json({ error: "unsupported_push_service" }, { status: 400 });
  }

  const userAgent = descriviDispositivo(request.headers.get("user-agent"));

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userId: session.user.userId,
      userAgent,
    },
    update: {
      p256dh: keys.p256dh,
      auth: keys.auth,
      userId: session.user.userId,
      userAgent,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const parsed = rimozioneSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { endpoint } = parsed.data;
  const segreto = parsed.data.keys?.auth;
  const session = await auth();
  const userId = session?.user?.userId;

  if (!userId && !segreto) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let rimosse = 0;
  if (userId) {
    rimosse = (await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } })).count;
  }
  // Prova di possesso: vale anche se il dispositivo è ora associato a un altro
  // utente o se la sessione non c'è più.
  if (rimosse === 0 && segreto) {
    rimosse = (await prisma.pushSubscription.deleteMany({ where: { endpoint, auth: segreto } })).count;
  }

  if (rimosse > 0) console.info("[PUSH-REVOKED]", { rimosse, conSessione: Boolean(userId) });
  return NextResponse.json({ ok: true, rimosse });
}
