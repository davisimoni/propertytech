import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildMetaAuthUrl, isMetaConfigured, signOAuthState } from "@/lib/social/meta";

/**
 * Avvia il consenso Meta per la Pagina Facebook dell'agenzia.
 *
 * # Lo `state` è firmato, non è un id in chiaro
 *
 * Il parametro torna dal callback e dice a quale agenzia attribuire la Pagina.
 * Se fosse il solo `organizationId`, chiunque potrebbe completare un consenso
 * con l'id di un'altra agenzia scritto a mano e agganciarle la propria Pagina
 * — o peggio, agganciare a sé la Pagina di qualcun altro. Firmandolo con il
 * segreto dell'app, un valore modificato non supera la verifica al ritorno.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo il titolare può collegare i social dell'agenzia." },
      { status: 403 }
    );
  }

  if (!isMetaConfigured()) {
    return NextResponse.json(
      {
        error: "meta_not_configured",
        message:
          "La connessione ai social non è ancora attiva su questo ambiente. Scrivici e la abilitiamo per la tua agenzia.",
      },
      { status: 503 }
    );
  }

  const state = signOAuthState(session.user.organizationId);
  const url = buildMetaAuthUrl(state);

  if (!url) {
    return NextResponse.json({ error: "meta_not_configured" }, { status: 503 });
  }

  return NextResponse.json({ url });
}
