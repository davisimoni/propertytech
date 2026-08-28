import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import {
  MAX_IMAGE_DATA_URL_CHARS,
  MAX_IMAGES_PER_PROPERTY,
  decodeImageDataUrl,
  extensionForMimeType,
  imagePath,
} from "@/lib/listings/property-images";
import {
  deleteObject,
  objectKeyFromUrl,
  putObject,
  readStorageConfig,
} from "@/lib/storage/object-storage";

const uploadSchema = z.object({
  dataUrl: z.string().min(32).max(MAX_IMAGE_DATA_URL_CHARS, "Immagine troppo pesante"),
});

// Si lavora sull'URL memorizzato, non su un id: con l'object storage attivo
// una foto non ha una riga nel database, e un contratto basato sull'id
// funzionerebbe solo per meta' dell'archivio.
const imageRefSchema = z.object({ image: z.string().min(1) });

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

  const storage = readStorageConfig();

  // Con lo storage configurato i byte non entrano nel database: la colonna
  // `images` riceve l'URL pubblico dello storage invece del percorso della
  // nostra rotta. E' esattamente il motivo per cui quella colonna contiene URL
  // e non byte — cambia il valore, non lo schema, non il feed, non la UI.
  if (storage) {
    // La chiave la generiamo noi e non deriva in alcun modo dall'input: il
    // prefisso per agenzia e immobile rende impossibile scrivere sopra
    // l'oggetto di qualcun altro anche in caso di collisione.
    const objectKey = `${found.organizationId}/${found.property.id}/${randomUUID()}.${extensionForMimeType(decoded.mimeType)}`;

    let publicUrl: string;
    try {
      publicUrl = await putObject(storage, objectKey, decoded.bytes, decoded.mimeType);
    } catch {
      // Nessun ripiego silenzioso sulla tabella: se lo storage e' configurato
      // ma rifiuta, scriverne una copia nel database darebbe un archivio meta'
      // di qua e meta' di la', e nessuno se ne accorgerebbe fino alla
      // migrazione. Meglio un errore visibile all'agente.
      return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });
    }

    const updated = await prisma.property.update({
      where: { id: found.property.id },
      data: { images: { push: publicUrl } },
      select: { images: true },
    });

    return NextResponse.json({ images: updated.images });
  }

  // Ripiego: byte nel database, serviti dalla nostra rotta pubblica.
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

/** Rimuove una fotografia: contenuto e riferimento spariscono insieme. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const found = await requireProperty(id);
  if (!found) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = imageRefSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const target = parsed.data.image;

  // Il riferimento deve gia' appartenere a questo immobile: e' cio' che
  // impedisce di far cancellare un oggetto arbitrario passando un URL a caso.
  if (!found.property.images.includes(target)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const storage = readStorageConfig();
  const objectKey = storage ? objectKeyFromUrl(storage, target) : null;
  const localId = target.startsWith("/api/images/") ? target.slice("/api/images/".length) : null;

  const images = await prisma.$transaction(async (tx) => {
    if (localId) {
      // deleteMany con l'organizationId nel filtro: un id di un'altra agenzia
      // non cancella nulla invece di sollevare un errore.
      await tx.propertyImage.deleteMany({
        where: { id: localId, organizationId: found.organizationId },
      });
    }

    const updated = await tx.property.update({
      where: { id: found.property.id },
      data: { images: found.property.images.filter((value) => value !== target) },
      select: { images: true },
    });

    return updated.images;
  });

  // Fuori dalla transazione e non bloccante: se il riferimento e' gia' sparito
  // dalla scheda, una foto rimasta nel bucket costa spazio, mentre un errore
  // qui costerebbe all'agente un'operazione che dalla sua parte e' riuscita.
  if (storage && objectKey) {
    await deleteObject(storage, objectKey);
  }

  return NextResponse.json({ images });
}

/**
 * Promuove una fotografia a copertina spostandola in prima posizione.
 *
 * L'ordine dell'array e' l'ordine di pubblicazione, e sui portali la prima
 * immagine e' quella che compare nei risultati di ricerca: e' la foto che
 * decide se qualcuno apre l'annuncio.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const found = await requireProperty(id);
  if (!found) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = imageRefSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const target = parsed.data.image;
  if (!found.property.images.includes(target)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const reordered = [target, ...found.property.images.filter((value) => value !== target)];

  const updated = await prisma.property.update({
    where: { id: found.property.id },
    data: { images: reordered },
    select: { images: true },
  });

  return NextResponse.json({ images: updated.images });
}
