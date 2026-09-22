import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkFeatureAccess } from "@/lib/feature-access";
import { elencaCommenti, elencaPost, isPiattaforma } from "@/lib/social/comments";

/**
 * Post recenti e loro commenti, su Instagram o su una Pagina Facebook.
 *
 * Una rotta sola per due letture perché sono lo stesso gesto in due tempi: si
 * apre la scheda e si vedono i post, si sceglie un post e si vedono i suoi
 * commenti. Due rotte con lo stesso gate e lo stesso caricamento del token
 * sarebbero due posti dove sbagliare il controllo invece di uno.
 *
 * Gate: `socialMultiplier`, come generazione e pubblicazione. I commenti sono
 * la coda del modulo Social, non una funzione a sé che meriti un piano proprio.
 */
export const maxDuration = 30;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const accessResponse = await checkFeatureAccess(session.user.organizationId, "socialMultiplier");
  if (accessResponse) return accessResponse;

  const parametri = new URL(request.url).searchParams;
  const richiesta = parametri.get("piattaforma");
  // Instagram di riserva: è la piattaforma con cui la scheda si apre, e un
  // valore storpiato non deve diventare un errore in faccia all'agente.
  const piattaforma = isPiattaforma(richiesta) ? richiesta : "instagram";
  const postId = parametri.get("postId")?.trim();

  const esito = postId
    ? await elencaCommenti(session.user.organizationId, piattaforma, postId)
    : await elencaPost(session.user.organizationId, piattaforma);

  if (!esito.ok) {
    /*
     * 409 e non 500: non è un guasto nostro, è una condizione che l'agente
     * può risolvere (ricollegare la Pagina, concedere i permessi). Un 500
     * manderebbe l'interfaccia a mostrare "errore del server" per una cosa
     * che si sistema in due clic.
     */
    return NextResponse.json({ error: "meta_error", message: esito.errore }, { status: 409 });
  }

  return NextResponse.json(postId ? { comments: esito.dati } : { posts: esito.dati });
}
