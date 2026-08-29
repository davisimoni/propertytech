import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Il logo viaggia come data URI ed è salvato nel database.
 *
 * Il limite è volutamente basso: un logo d'agenzia è un'immagine piccola, e
 * senza tetto una riga di database potrebbe crescere di megabyte, rallentando
 * ogni lettura dell'organizzazione. La codifica base64 aggiunge circa un terzo
 * al peso del file originale, quindi 400 KB qui equivalgono a ~300 KB di PNG.
 */
const MAX_LOGO_DATA_URL_CHARS = 400_000;

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const brandingSchema = z.object({
  legalName: z.string().trim().max(200).optional(),
  /** `null` rimuove il logo; assente lo lascia invariato. */
  logoDataUrl: z
    .string()
    .max(MAX_LOGO_DATA_URL_CHARS, "Il logo supera la dimensione massima consentita")
    .nullable()
    .optional(),
});

/** Verifica che il data URI sia un'immagine di formato ammesso. */
function isAllowedImageDataUrl(value: string): boolean {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(value);
  if (!match) return false;

  const mimeType = match[1];
  const payload = match[2];
  if (!mimeType || !payload) return false;

  if (!ALLOWED_IMAGE_TYPES.includes(mimeType.toLowerCase())) return false;

  // Un payload troppo corto non è un'immagine valida: meglio rifiutarlo qui
  // che ritrovarsi un PDF che non si genera.
  return payload.length > 100;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { agencyName: true, legalName: true, logoDataUrl: true },
  });

  if (!organization) {
    return NextResponse.json({ error: "organization_not_found" }, { status: 404 });
  }

  return NextResponse.json(organization);
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = brandingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_payload",
        message: parsed.error.issues[0]?.message ?? "Dati non validi.",
      },
      { status: 400 }
    );
  }

  const { legalName, logoDataUrl } = parsed.data;

  if (typeof logoDataUrl === "string" && !isAllowedImageDataUrl(logoDataUrl)) {
    return NextResponse.json(
      {
        error: "invalid_logo",
        message: "Carica un'immagine PNG, JPG o WebP.",
      },
      { status: 400 }
    );
  }

  // Ragione sociale e logo finiscono sui PDF che escono dall'agenzia: sono
  // l'identita' con cui si presenta, non un'impostazione di lavoro.
  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo il titolare puo' modificare i dati dell'agenzia." },
      { status: 403 }
    );
  }

  const updated = await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: {
      ...(legalName !== undefined && { legalName: legalName || null }),
      ...(logoDataUrl !== undefined && { logoDataUrl }),
    },
    select: { agencyName: true, legalName: true, logoDataUrl: true },
  });

  return NextResponse.json(updated);
}
