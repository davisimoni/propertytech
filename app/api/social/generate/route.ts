import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { previewFromContent } from "@/lib/history/entries";
import { checkFeatureAccess } from "@/lib/feature-access";
import { socialGenerationRequestSchema } from "@/lib/ai/social-schema";
import { generateSocialContent, SocialGenerationError } from "@/lib/ai/social-generator";
import { generaImmagineSocial } from "@/lib/ai/social-image";

/**
 * Tre formati generati in un'unica chiamata, con 8192 token di uscita: sugli
 * immobili descritti in dettaglio supera comodamente il limite predefinito.
 *
 * Cinque minuti e non uno: dall'istruzione libera si genera anche l'immagine,
 * e il modello che la produce impiega da solo mezzo minuto. Col minuto di
 * prima la funzione moriva dopo aver pagato il testo e l'immagine, senza
 * consegnare nulla.
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Il Social Multiplier è sbloccato dal piano, non consumato a crediti:
  // il gate è quindi sulla funzionalità e non su un contatore.
  const accessResponse = await checkFeatureAccess(session.user.organizationId, "socialMultiplier");
  if (accessResponse) {
    return accessResponse;
  }

  const body = await request.json().catch(() => null);
  const parsed = socialGenerationRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    /*
     * Testo e immagine insieme, non in fila.
     *
     * Non dipendono l'uno dall'altra: l'immagine nasce dall'istruzione
     * dell'agente, non dall'annuncio generato. In sequenza l'attesa era la
     * somma delle due (misurata: ~50 secondi la sola immagine), in parallelo
     * e' la piu' lunga delle due. E' la differenza fra un'attesa e un sospetto
     * di blocco.
     *
     * L'immagine solo per l'istruzione libera: le altre tre strade partono da
     * un immobile che esiste, e li' la foto giusta e' quella vera, che sta in
     * Portafoglio Immobili. Generarne una somiglierebbe a una casa diversa da
     * quella in vendita.
     */
    const [content, generatedMedia] = await Promise.all([
      generateSocialContent(parsed.data),
      parsed.data.freePrompt && parsed.data.generateImage
        ? generaImmagineSocial(session.user.organizationId, parsed.data.freePrompt)
        : Promise.resolve(null),
    ]);

    // Conservata in cronologia, senza bloccare: l'agente ha atteso la
    // generazione e deve riceverla anche se la scrittura fallisce.
    const saved = await prisma.aiGeneration
      .create({
        data: {
          organizationId: session.user.organizationId,
          createdById: session.user.userId ?? null,
          kind: "SOCIAL",
          // `propertyTitle` non è più obbligatorio: generando dal solo testo
          // incollato non esiste. Si ripiega sul titolo prodotto dall'AI, che
          // è pure più descrittivo di un testo grezzo troncato a metà parola.
          title: (parsed.data.propertyTitle || content.portalListing?.title || "Annuncio").slice(
            0,
            160
          ),
          preview: previewFromContent({
            annuncio: content.portalListing?.body,
            instagram: content.socialPost?.caption,
          }),
          output: content as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      })
      .catch((error) => {
        console.error("[api/social/generate] Salvataggio in cronologia non riuscito", error);
        return null;
      });

    /*
     * `content` porta già testo e hashtag (`socialPost.caption`,
     * `socialPost.hashtags`), quindi non vengono ripetuti in cima alla
     * risposta: due copie dello stesso valore divergono al primo ritocco, e
     * l'interfaccia non saprebbe quale delle due è quella buona.
     */
    return NextResponse.json({
      content,
      generationId: saved?.id ?? null,
      generatedMedia,
    });
  } catch (error) {
    if (error instanceof SocialGenerationError) {
      const status = error.code === "upstream_error" ? 502 : 422;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }

    console.error("[api/social/generate] Unexpected error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
