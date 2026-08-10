import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { previewFromContent } from "@/lib/history/entries";
import { checkFeatureAccess } from "@/lib/feature-access";
import { socialGenerationRequestSchema } from "@/lib/ai/social-schema";
import { generateSocialContent, SocialGenerationError } from "@/lib/ai/social-generator";

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
    const content = await generateSocialContent(parsed.data);

    // Conservata in cronologia, senza bloccare: l'agente ha atteso la
    // generazione e deve riceverla anche se la scrittura fallisce.
    const saved = await prisma.aiGeneration
      .create({
        data: {
          organizationId: session.user.organizationId,
          createdById: session.user.userId ?? null,
          kind: "SOCIAL",
          title: parsed.data.propertyTitle.slice(0, 160),
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

    return NextResponse.json({ content, generationId: saved?.id ?? null });
  } catch (error) {
    if (error instanceof SocialGenerationError) {
      const status = error.code === "upstream_error" ? 502 : 422;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }

    console.error("[api/social/generate] Unexpected error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
