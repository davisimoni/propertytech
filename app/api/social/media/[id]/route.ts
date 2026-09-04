import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decodeImageDataUrl } from "@/lib/listings/property-images";

/**
 * Media di un post social, servito pubblicamente.
 *
 * **Pubblico per necessita'**: a scaricarlo sono i server di Meta. Instagram
 * non accetta byte inviati da noi — vuole un `image_url` che possa
 * raggiungere da solo — e Facebook scarica allo stesso modo la foto passata
 * come `url`. Dietro un login non pubblicherebbero niente.
 *
 * L'id e' la sola chiave d'accesso, come per le foto degli annunci: va bene
 * per un'immagine destinata per definizione a finire su un profilo pubblico.
 * Non userei questa rotta per un documento, che infatti resta autenticato.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const asset = await prisma.socialMediaAsset.findUnique({
    where: { id },
    select: { dataUrl: true },
  });

  if (!asset) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Tipo rivalidato in lettura, non solo al caricamento: una riga arrivata da
  // un ripristino o da una modifica diretta al database renderebbe inutile il
  // controllo fatto in scrittura mesi prima, e serviremmo contenuto arbitrario
  // dalla nostra stessa origine.
  const decoded = decodeImageDataUrl(asset.dataUrl);
  if (!decoded) {
    console.error("[social/media] Contenuto non servibile", { assetId: id });
    return NextResponse.json({ error: "unsupported_file_type" }, { status: 415 });
  }

  return new NextResponse(new Uint8Array(decoded.bytes), {
    headers: {
      "Content-Type": decoded.mimeType,
      "X-Content-Type-Options": "nosniff",
      // I byte di un id non cambiano mai: un nuovo allegato e' un nuovo id.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
