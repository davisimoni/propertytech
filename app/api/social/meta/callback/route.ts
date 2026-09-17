import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/seo";
import { exchangeCodeForPage, saveConnection, verifyOAuthState } from "@/lib/social/meta";

/**
 * Ritorno dal consenso Meta.
 *
 * # Perché non c'è `auth()` qui
 *
 * Perché l'utente arriva da un rimbalzo su facebook.com, e a seconda del
 * browser il cookie di sessione può non viaggiare su una navigazione di
 * ritorno da un dominio terzo. L'identità dell'agenzia viaggia quindi nello
 * `state` **firmato**: è quello a dire di chi è questa Pagina, e una firma che
 * non torna fa terminare tutto senza scrivere niente.
 *
 * # Perché si finisce sempre in pagina e non con un JSON
 *
 * Perché qui c'è una persona che sta guardando, non un programma. Ogni esito
 * riporta a Impostazioni con un esito leggibile: un JSON in faccia dopo un
 * consenso è il modo più rapido per far credere che si sia rotto qualcosa.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errore = url.searchParams.get("error");

  // L'utente ha annullato dal dialogo Meta: non è un guasto, si torna indietro
  // senza allarmare.
  if (errore) {
    return redirect("annullato");
  }

  if (!code || !state) {
    return redirect("errore");
  }

  const organizationId = verifyOAuthState(state);
  if (!organizationId) {
    console.error("[api/social/meta/callback] State non valido: consenso rifiutato.");
    return redirect("errore");
  }

  try {
    const esito = await exchangeCodeForPage(code);

    // Un esito per causa: "nessuna Pagina" solo quando le Pagine sono state
    // davvero cercate e non trovate. Il dettaglio di cosa ha risposto Meta è
    // nei log (`[social/meta] Nessuna Pagina collegabile`).
    if (!esito.ok) {
      console.warn("[api/social/meta/callback] Collegamento non riuscito", {
        organizationId,
        motivo: esito.motivo,
      });
      const ESITO_PER_MOTIVO = {
        scambio_codice: "errore",
        lettura_pagine: "errore-meta",
        permessi_mancanti: "permessi-mancanti",
        nessuna_pagina: "nessuna-pagina",
      } as const;
      return redirect(ESITO_PER_MOTIVO[esito.motivo]);
    }

    const page = esito.page;
    await saveConnection(organizationId, page);

    console.info("[SOCIAL-CONNECTED]", {
      organizationId,
      pagina: page.facebookPageName,
      instagram: page.instagramUsername ?? "non collegato",
    });

    return redirect("connesso");
  } catch (error) {
    console.error("[api/social/meta/callback] Collegamento non riuscito", { error });
    return redirect("errore");
  }
}

function redirect(esito: string): NextResponse {
  return NextResponse.redirect(`${SITE_URL}/settings?tab=integrations&social=${esito}`);
}
