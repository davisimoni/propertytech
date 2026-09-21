import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { checkFeatureAccess } from "@/lib/feature-access";
import {
  MAX_LUNGHEZZA_RISPOSTA,
  nascondiCommento,
  rispondiACommento,
} from "@/lib/social/comments";

/**
 * Risposta pubblica a un commento, e moderazione.
 *
 * # Perché una rotta sola con un'azione dichiarata
 *
 * Rispondere e nascondere sono due gesti sullo stesso oggetto, fatti dalla
 * stessa schermata, con lo stesso gate e lo stesso token. Separarli in due
 * rotte significherebbe ricopiare il controllo di piano e l'autenticazione,
 * cioè creare il posto in cui fra sei mesi uno dei due sarà rimasto indietro.
 *
 * # Perché non esiste l'azione "cancella"
 *
 * Nascondere è reversibile e basta contro lo spam; cancellare no. Una
 * cancellazione fatta per sbaglio da un telefono, sotto il post di un cliente,
 * non si recupera — e non è una funzione che qualcuno ci ha chiesto.
 */
export const maxDuration = 30;

const schema = z.object({
  commentId: z.string().trim().min(1, "Commento non indicato"),
  azione: z.enum(["rispondi", "nascondi", "mostra"]).default("rispondi"),
  message: z
    .string()
    .trim()
    .min(1, "La risposta è vuota")
    .max(MAX_LUNGHEZZA_RISPOSTA, "La risposta è troppo lunga per Instagram")
    .optional(),
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

  const { commentId, azione } = parsed.data;

  if (azione === "rispondi") {
    // Il testo è obbligatorio solo qui: lo schema non può dichiararlo
    // condizionale senza rendere illeggibili gli errori delle altre azioni.
    if (!parsed.data.message) {
      return NextResponse.json(
        { error: "invalid_payload", message: "La risposta è vuota" },
        { status: 400 }
      );
    }

    const esito = await rispondiACommento(
      session.user.organizationId,
      commentId,
      parsed.data.message
    );

    if (!esito.ok) {
      return NextResponse.json({ error: "meta_error", message: esito.errore }, { status: 409 });
    }

    return NextResponse.json({ ok: true, id: esito.dati.id });
  }

  const esito = await nascondiCommento(
    session.user.organizationId,
    commentId,
    azione === "nascondi"
  );

  if (!esito.ok) {
    return NextResponse.json({ error: "meta_error", message: esito.errore }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
