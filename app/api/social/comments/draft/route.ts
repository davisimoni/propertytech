import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFeatureAccess } from "@/lib/feature-access";
import { generaRispostaCommento } from "@/lib/ai/comment-reply";

/**
 * Bozza di risposta scritta dall'AI. Non pubblica niente.
 *
 * # Perché non consuma crediti
 *
 * I contatori del piano misurano conversazioni WhatsApp, documenti e note
 * vocali. Questa è una generazione di testo dentro il modulo Social, che è
 * già riservato all'Enterprise e non ha contatore: aggiungerne uno qui
 * significherebbe inventare una valuta che il listino non dichiara, e
 * l'agente la scoprirebbe quando smette di funzionare qualcosa che credeva
 * incluso.
 *
 * # Il nome dell'agenzia arriva dal database, non dal browser
 *
 * Perché è il dato con cui il testo si presenta a un cliente. Accettarlo dal
 * corpo della richiesta vorrebbe dire lasciare che chiunque faccia scrivere
 * al nostro modello una risposta firmata con il nome di un'altra agenzia.
 */
export const maxDuration = 60;

const schema = z.object({
  piattaforma: z.enum(["instagram", "facebook"]).default("instagram"),
  commento: z.string().trim().min(1, "Il commento è vuoto").max(1000),
  autore: z.string().trim().min(1).max(100),
  didascalia: z.string().trim().max(2200).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const accessResponse = await checkFeatureAccess(session.user.organizationId, "socialMultiplier");
  if (accessResponse) return accessResponse;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", message: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { agencyName: true },
  });

  const esito = await generaRispostaCommento({
    piattaforma: parsed.data.piattaforma,
    commento: parsed.data.commento,
    autore: parsed.data.autore,
    didascalia: parsed.data.didascalia ?? null,
    agenzia: organization?.agencyName ?? "l'agenzia",
  });

  if (!esito.ok) {
    return NextResponse.json({ error: "ai_error", message: esito.errore }, { status: 502 });
  }

  return NextResponse.json({ draft: esito.testo });
}
