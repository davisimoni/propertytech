import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  MAX_IMAGE_DATA_URL_CHARS,
  MAX_IMAGES_PER_PROPERTY,
  decodeImageDataUrl,
  imagePath,
} from "@/lib/listings/property-images";

const uploadSchema = z.object({
  dataUrl: z.string().min(32).max(MAX_IMAGE_DATA_URL_CHARS, "Immagine troppo pesante"),
});

const deleteSchema = z.object({ imageId: z.string().min(1) });
const reorderSchema = z.object({ imageId: z.string().min(1) });

async function requireProperty(propertyId: string) {
  const session = await auth();
  const organizationId = session?.user?.organizationId;
  if (!organizationId) return null;

  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
    select: { id: true, images: true },
  });

  return property ? { organizationId, property } : null;
}

/**
 * Carica una fotografia dell'annuncio.
 *
 * Il browser invia un data URI già ridimensionato: la riduzione sta lato
 * client perché una foto da fotocamera pesa 6-10 MB e caricarla intera
 * significherebbe attendere su una connessione mobile — cioè esattamente dove
 * si trova l'agente quando finisce un sopralluogo.
 *
 * La riga dell'immagine e l'URL in `Property.images` nascono **in
 * transazione**: sono due scritture per un fatto solo, e se la seconda
 * fallisse resterebbe un blob senza riferimenti, invisibile e impossibile da
 * cancellare dalla UI.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const found = await requireProperty(id);
  if (!found) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = uploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  }

  const decoded = decodeImageDataUrl(parsed.data.dataUrl);
  if (!decoded) {
    return NextResponse.json({ error: "unsupported_file_type" }, { status: 415 });
  }

  if (found.property.images.length >= MAX_IMAGES_PER_PROPERTY) {
    return NextResponse.json(
      { error: "too_many_images", limit: MAX_IMAGES_PER_PROPERTY },
      { status: 409 }
    );
  }

  const images = await prisma.$transaction(async (tx) => {
    const created = await tx.propertyImage.create({
      data: {
        dataUrl: parsed.data.dataUrl,
        mimeType: decoded.mimeType,
        byteSize: decoded.bytes.length,
        propertyId: found.property.id,
        organizationId: found.organizationId,
      },
      select: { id: true },
    });

    const updated = await tx.property.update({
      where: { id: found.property.id },
      data: { images: { push: imagePath(created.id) } },
      select: { images: true },
    });

    return updated.images;
  });

  return NextResponse.json({ images });
}

/** Rimuove una fotografia: byte e riferimento spariscono insieme. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const found = await requireProperty(id);
  if (!found) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const path = imagePath(parsed.data.imageId);
  if (!found.property.images.includes(path)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const images = await prisma.$transaction(async (tx) => {
    // deleteMany con l'organizationId nel filtro: un id di un'altra agenzia
    // non cancella nulla invece di sollevare un errore.
    await tx.propertyImage.deleteMany({
      where: { id: parsed.data.imageId, organizationId: found.organizationId },
    });

    const updated = await tx.property.update({
      where: { id: found.property.id },
      data: { images: found.property.images.filter((value) => value !== path) },
      select: { images: true },
    });

    return updated.images;
  });

  return NextResponse.json({ images });
}

/**
 * Promuove una fotografia a copertina spostandola in prima posizione.
 *
 * L'ordine dell'array è l'ordine di pubblicazione, e sui portali la prima
 * immagine è quella che compare nei risultati di ricerca: è la foto che decide
 * se qualcuno apre l'annuncio.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const found = await requireProperty(id);
  if (!found) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = reorderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const path = imagePath(parsed.data.imageId);
  if (!found.property.images.includes(path)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const reordered = [path, ...found.property.images.filter((value) => value !== path)];

  const updated = await prisma.property.update({
    where: { id: found.property.id },
    data: { images: reordered },
    select: { images: true },
  });

  return NextResponse.json({ images: updated.images });
}
