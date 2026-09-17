import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveOwner } from "@/lib/email/recipients";
import { sendSocialPublishFailedEmail } from "@/lib/email/transactional";
import type { PublishResult } from "@/lib/social/meta";

/**
 * Avviso di pubblicazione social non riuscita. Non lancia mai.
 *
 * # A chi
 *
 * A chi ha avviato la pubblicazione, se ha un accesso attivo: è la persona che
 * sa quale annuncio stava pubblicando e può ripeterlo. In mancanza, al
 * titolare. Oggi la pubblicazione è manuale e l'esito compare anche a schermo;
 * l'email copre chi ha chiuso la pagina durante l'invio (Meta può impiegare
 * decine di secondi) ed è pronta per una futura pubblicazione automatica, che
 * non avrebbe nessuno davanti allo schermo.
 */
export async function notificaPubblicazioneFallita(params: {
  organizationId: string;
  userId: string | null;
  esiti: PublishResult[];
  messaggio: string;
}): Promise<void> {
  const falliti = params.esiti.filter((esito) => !esito.ok);
  if (falliti.length === 0) return;

  try {
    const autore = params.userId
      ? await prisma.user.findFirst({
          where: {
            id: params.userId,
            organizationId: params.organizationId,
            acceptedAt: { not: null },
          },
          select: { email: true, firstName: true },
        })
      : null;
    const destinatario = autore ?? (await resolveOwner(params.organizationId));
    if (!destinatario) return;

    const outcome = await sendSocialPublishFailedEmail({
      to: destinatario.email,
      firstName: destinatario.firstName,
      falliti: falliti.map((esito) => ({
        canale: esito.target,
        motivo: esito.error ?? "Errore non specificato restituito da Meta.",
      })),
      anteprima: params.messaggio,
    });

    console.info("[SOCIAL-PUBLISH-FAILED-NOTIFY]", {
      organizationId: params.organizationId,
      canali: falliti.map((esito) => esito.target),
      outcome,
    });
  } catch (error) {
    console.error("[notifications/social-publish] Avviso non inviato", {
      organizationId: params.organizationId,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}
