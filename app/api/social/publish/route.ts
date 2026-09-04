import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { checkFeatureAccess } from "@/lib/feature-access";
import { publishToMeta } from "@/lib/social/meta";
import { parsePublicHttpUrl } from "@/lib/net/safe-url";
import { MAX_SOCIAL_MEDIA } from "@/lib/social/media-limits";

/**
 * Pubblica il post generato sulla Pagina Facebook e sul profilo Instagram.
 *
 * Stesso gate di piano della generazione: il Social Multiplier è Enterprise, e
 * pubblicare è la coda di quella funzione, non una funzione a sé.
 */
export const maxDuration = 60;

const publishSchema = z.object({
  message: z.string().trim().min(1, "Il testo del post è vuoto").max(2200),
  /**
   * URL delle foto, in ordine: la prima e' la copertina.
   *
   * Possono essere assoluti (object storage) o relativi alla nostra rotta
   * pubblica `/api/social/media/<id>`: li rende assoluti `publishToMeta`,
   * perche' a scaricarli sono i server di Meta e non noi.
   */
  mediaUrls: z.array(z.string().trim().min(1)).max(MAX_SOCIAL_MEDIA).optional(),
  targets: z.array(z.enum(["facebook", "instagram"])).min(1, "Scegli almeno un canale"),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const accessResponse = await checkFeatureAccess(session.user.organizationId, "socialMultiplier");
  if (accessResponse) return accessResponse;

  const body = await request.json().catch(() => null);
  const parsed = publishSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", message: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }

  const { message, targets } = parsed.data;
  const mediaUrls = parsed.data.mediaUrls ?? [];

  /*
   * Gli indirizzi assoluti passano dalla stessa guardia degli altri URL
   * forniti dall'utente.
   *
   * Qui l'indirizzo non lo scarichiamo noi: lo scaricano i server di Meta. Ma
   * un indirizzo interno finirebbe comunque salvato e mostrato, e le regole su
   * cosa e' un indirizzo accettabile stanno in un posto solo (CLAUDE.md §3) —
   * due copie divergono, e la copia dimenticata diventa il buco.
   *
   * I percorsi relativi (`/api/social/media/...`, `/api/images/...`) sono
   * nostri e non passano di li': non c'e' un host da verificare, e la guardia
   * li rifiuterebbe proprio perche' interni.
   */
  for (const url of mediaUrls) {
    if (!url.startsWith("/") && !parsePublicHttpUrl(url).ok) {
      return NextResponse.json(
        { error: "invalid_image_url", message: "L'indirizzo di una foto non è valido." },
        { status: 400 }
      );
    }
  }

  /*
   * Instagram senza foto si ferma qui, non a meta' strada.
   *
   * L'API rifiuterebbe comunque, ma lo farebbe dopo aver gia' pubblicato su
   * Facebook: l'agente vedrebbe un post online e un errore accanto, senza
   * capire cosa e' andato dove.
   */
  if (targets.includes("instagram") && mediaUrls.length === 0) {
    return NextResponse.json(
      {
        error: "instagram_requires_media",
        message:
          "Instagram non pubblica post di solo testo: allega almeno una foto, oppure pubblica solo su Facebook.",
      },
      { status: 400 }
    );
  }

  const esiti = await publishToMeta({
    organizationId: session.user.organizationId,
    message,
    mediaUrls,
    targets,
  });

  console.info("[SOCIAL-PUBLISH]", {
    organizationId: session.user.organizationId,
    esiti: esiti.map((e) => `${e.target}:${e.ok ? "ok" : e.error}`),
  });

  /*
   * 200 anche con qualche canale fallito.
   *
   * Facebook riuscito e Instagram no — perche' manca l'immagine — e' un esito
   * normale, non un errore della richiesta. Un 4xx complessivo farebbe
   * scomparire dall'interfaccia il post che invece e' andato online, e
   * qualcuno lo ripubblicherebbe.
   */
  return NextResponse.json({ results: esiti });
}
