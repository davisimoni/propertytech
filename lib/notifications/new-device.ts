import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendNewDeviceEmail } from "@/lib/email/transactional";

/**
 * Avviso di accesso da un dispositivo mai visto.
 *
 * # Cosa si conserva, e cosa no
 *
 * Un'**impronta**: l'hash di user agent e indirizzo IP troncato. L'IP è un
 * dato personale, e tenerlo in chiaro per ogni accesso costruirebbe lo storico
 * degli spostamenti di ogni agente — per una funzione che ha bisogno solo di
 * rispondere "questo l'avevo già visto?".
 *
 * # Perché l'IP è troncato prima di essere hashato
 *
 * Un hash dell'IP intero cambierebbe a ogni salto di rete: casa, ufficio,
 * 4G, il wifi di un bar durante una visita. L'agente riceverebbe un avviso
 * al giorno e smetterebbe di leggerli — che è il modo più efficace di rendere
 * inutile un avviso di sicurezza. Troncando all'ultimo ottetto (o agli ultimi
 * blocchi in IPv6) resta la rete e sparisce il dispositivo specifico: la
 * granularità giusta per distinguere "un posto nuovo" da "la solita rete".
 */

/** Rete di provenienza, non indirizzo esatto. */
function coarseIp(ip: string): string {
  if (ip.includes(":")) return ip.split(":").slice(0, 4).join(":");
  return ip.split(".").slice(0, 3).join(".");
}

/** Etichetta leggibile: finisce nell'email, dove un hash non direbbe nulla. */
export function describeDevice(userAgent: string): string {
  const ua = userAgent.toLowerCase();

  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("chrome/") && !ua.includes("chromium")
      ? "Chrome"
      : ua.includes("firefox/")
        ? "Firefox"
        : ua.includes("safari/")
          ? "Safari"
          : "Browser";

  const sistema = ua.includes("iphone")
    ? "iPhone"
    : ua.includes("ipad")
      ? "iPad"
      : ua.includes("android")
        ? "Android"
        : ua.includes("windows")
          ? "Windows"
          : ua.includes("mac os")
            ? "Mac"
            : ua.includes("linux")
              ? "Linux"
              : "dispositivo sconosciuto";

  return `${browser} su ${sistema}`;
}

/**
 * Registra l'accesso e avvisa se il dispositivo è nuovo. Non lancia mai.
 *
 * Un accesso deve riuscire anche se questa funzione fallisce: bloccare il
 * login perché non si è potuta scrivere una riga di telemetria sarebbe un
 * disservizio molto peggiore del problema che risolve.
 */
export async function recordSignIn(params: {
  userId: string;
  email: string;
  firstName?: string | null;
  userAgent: string | null;
  ip: string | null;
}): Promise<void> {
  try {
    const userAgent = params.userAgent?.slice(0, 400) ?? "sconosciuto";
    const rete = params.ip ? coarseIp(params.ip) : "rete-sconosciuta";

    const fingerprint = createHash("sha256").update(`${userAgent}|${rete}`).digest("hex");

    const esistente = await prisma.knownDevice.findUnique({
      where: { userId_fingerprint: { userId: params.userId, fingerprint } },
      select: { id: true },
    });

    if (esistente) {
      await prisma.knownDevice.update({
        where: { id: esistente.id },
        data: { lastSeenAt: new Date() },
      });
      return;
    }

    const label = describeDevice(userAgent);

    // Il dispositivo si registra PRIMA dell'invio: se l'email fallisce non
    // vogliamo comunque riprovare a ogni accesso successivo dallo stesso
    // posto, trasformando un guasto di posta in una raffica.
    await prisma.knownDevice.create({
      data: { userId: params.userId, fingerprint, label },
    });

    // Primo dispositivo in assoluto: è quello con cui la persona si è appena
    // registrata o ha accettato l'invito. Avvisarla che "ha effettuato
    // l'accesso" mentre sta guardando la schermata è rumore.
    const conosciuti = await prisma.knownDevice.count({ where: { userId: params.userId } });
    if (conosciuti <= 1) return;

    const outcome = await sendNewDeviceEmail({
      to: params.email,
      firstName: params.firstName,
      device: label,
      when: new Date(),
    });

    console.info("[NEW-DEVICE-NOTIFY]", { userId: params.userId, outcome });
  } catch (error) {
    console.error("[notifications/new-device] Registrazione accesso non riuscita", {
      userId: params.userId,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}
