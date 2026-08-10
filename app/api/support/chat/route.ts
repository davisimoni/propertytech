import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { clientIp, hashIp } from "@/lib/contact/rate-limit";
import {
  burstWindowStart,
  evaluateChatRate,
  hourlyWindowStart,
  staleBefore,
} from "@/lib/support/rate-limit";
import {
  buildSupportSystemPrompt,
  MAX_ANSWER_TOKENS,
  MAX_HISTORY_MESSAGES,
  MAX_QUESTION_LENGTH,
} from "@/lib/support/knowledge";

/**
 * Assistente clienti della landing e della dashboard.
 *
 * Rotta **pubblica**: risponde anche a chi non ha un account, perché serve
 * soprattutto a chi sta valutando la piattaforma. Non legge sessione, non tocca
 * dati di nessuna agenzia e **non conserva le conversazioni** — chi scrive qui
 * può digitare il nome di un cliente, e non abbiamo motivo di custodirlo.
 *
 * Il modello è Haiku e non Opus: rispondere a domande su prezzi e funzioni non
 * richiede il modello più capace, e su una rotta aperta a chiunque la
 * differenza di costo per messaggio è la voce che conta.
 */
export const runtime = "nodejs";

const SUPPORT_MODEL = "claude-haiku-4-5-20251001";

const client = new Anthropic();

const chatSchema = z.object({
  message: z
    .string({ error: "Scrivi una domanda" })
    .trim()
    .min(2, "Scrivi una domanda un po' più lunga")
    .max(MAX_QUESTION_LENGTH, "La domanda è troppo lunga: prova a sintetizzarla"),
  /**
   * Storico tenuto dal browser e rimandato a ogni giro: sul server non
   * esiste una sessione di chat da conservare.
   */
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4_000),
      })
    )
    .max(40)
    .optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  // Guardia prima dello schema: su un corpo che non è nemmeno un oggetto Zod
  // risponde "Invalid input", in inglese e fuori tono col resto del widget.
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "invalid_payload", message: "Richiesta non valida." },
      { status: 400 }
    );
  }

  const parsed = chatSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", message: parsed.error.issues[0]?.message ?? "Richiesta non valida." },
      { status: 400 }
    );
  }

  const ip = clientIp(request.headers);
  const ipHash = ip ? hashIp(ip) : null;

  if (ipHash) {
    const now = new Date();

    const [burst, hourly] = await Promise.all([
      prisma.supportChatHit.count({ where: { ipHash, createdAt: { gte: burstWindowStart(now) } } }),
      prisma.supportChatHit.count({ where: { ipHash, createdAt: { gte: hourlyWindowStart(now) } } }),
    ]);

    const verdict = evaluateChatRate(burst, hourly);

    if (!verdict.allowed) {
      return NextResponse.json({ error: "rate_limited", message: verdict.message }, { status: 429 });
    }

    // Traccia registrata **prima** della chiamata al modello: se la scrivessimo
    // dopo, chi manda dieci richieste in parallelo le vedrebbe passare tutte
    // perché nessuna avrebbe ancora contato le altre.
    await prisma.supportChatHit.create({ data: { ipHash } });

    // Pulizia opportunistica, una volta ogni tanto: evita uno scheduler
    // dedicato per una tabella che serve solo a contare.
    if (Math.random() < 0.05) {
      await prisma.supportChatHit
        .deleteMany({ where: { createdAt: { lt: staleBefore(now) } } })
        .catch(() => undefined);
    }
  }

  // Solo gli ultimi scambi: una conversazione lunga rispedita per intero a ogni
  // messaggio fa crescere il costo in modo quadratico senza aiutare la risposta.
  const history = (parsed.data.history ?? []).slice(-MAX_HISTORY_MESSAGES);

  try {
    const response = await client.messages.create({
      model: SUPPORT_MODEL,
      max_tokens: MAX_ANSWER_TOKENS,
      system: buildSupportSystemPrompt(),
      messages: [
        ...history.map((message) => ({ role: message.role, content: message.content })),
        { role: "user" as const, content: parsed.data.message },
      ],
    });

    const answer = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!answer) {
      return NextResponse.json(
        {
          error: "empty_answer",
          message:
            "Non sono riuscito a formulare una risposta. Riprova, oppure scrivi a supporto@propertytechsolutions.net.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ answer });
  } catch (error) {
    // Nel log niente domanda dell'utente: è testo che può contenere dati
    // personali e non ha motivo di finire nei registri del server.
    console.error("[api/support/chat] Chiamata al modello non riuscita", {
      name: error instanceof Error ? error.name : "unknown",
    });

    return NextResponse.json(
      {
        error: "upstream_error",
        message:
          "L'assistente non è raggiungibile in questo momento. Riprova fra poco o scrivici a supporto@propertytechsolutions.net.",
      },
      { status: 502 }
    );
  }
}
