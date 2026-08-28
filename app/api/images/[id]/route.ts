import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decodeImageDataUrl } from "@/lib/listings/property-images";

/**
 * Fotografia di un annuncio, servita pubblicamente.
 *
 * **Pubblica per necessità, non per svista**: a scaricarla è il crawler di
 * Immobiliare.it o Idealista, che non ha una sessione. Sono inoltre immagini
 * destinate per definizione alla pubblicazione su un portale: proteggerle
 * dietro un login significherebbe pubblicare annunci senza foto.
 *
 * L'id è la sola chiave d'accesso. Va bene per una foto di un annuncio; non
 * userei mai questa rotta per un documento, che infatti resta autenticato.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const image = await prisma.propertyImage.findUnique({
    where: { id },
    select: { dataUrl: true },
  });

  if (!image) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Tipo rivalidato **in lettura**, non solo al caricamento: se una riga
  // arrivasse da un ripristino o da una modifica diretta al database, il
  // controllo fatto in scrittura mesi prima non varrebbe più nulla, e qui
  // staremmo servendo contenuto arbitrario dalla nostra stessa origine.
  const decoded = decodeImageDataUrl(image.dataUrl);
  if (!decoded) {
    console.error("[images] Contenuto non servibile", { imageId: id });
    return NextResponse.json({ error: "unsupported_file_type" }, { status: 415 });
  }

  return new NextResponse(new Uint8Array(decoded.bytes), {
    headers: {
      "Content-Type": decoded.mimeType,
      // Servita in linea, al contrario dei documenti: un portale deve poterla
      // mostrare, non scaricarla. È sicuro perché i tipi ammessi sono solo
      // raster — l'SVG, che è eseguibile, è escluso a monte — e `nosniff`
      // impedisce al browser di reinterpretare i byte come qualcos'altro.
      "X-Content-Type-Options": "nosniff",
      // I byte di un id non cambiano mai: una nuova foto è un nuovo id. Senza
      // questa cache ogni passaggio di un crawler rileggerebbe il blob dal
      // database.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
