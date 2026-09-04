import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFeatureAccess } from "@/lib/feature-access";
import {
  MAX_IMAGE_DATA_URL_CHARS,
  decodeImageDataUrl,
  extensionForMimeType,
} from "@/lib/listings/property-images";
import { putObject, readStorageConfig } from "@/lib/storage/object-storage";

/**
 * Carica una foto da allegare a un post social.
 *
 * # Perche' non riusa la rotta delle foto immobile
 *
 * Perche' quelle finiscono in `Property.images`, cioe' nel feed XML verso i
 * portali. Una grafica pensata per Instagram non deve comparire fra le foto
 * dell'annuncio su Immobiliare.it, e viceversa: sono due destinazioni
 * diverse, e riusare la stessa tabella le mescolerebbe senza che nessuno se
 * ne accorga finche' il portale non pubblica la cosa sbagliata.
 *
 * # Perche' il file diventa pubblico
 *
 * Perche' a scaricarlo sono i server di Meta. Instagram in particolare non
 * accetta byte caricati da noi: vuole un `image_url` che possa raggiungere da
 * solo. E' la stessa necessita' delle foto degli annunci, con gli stessi
 * limiti — solo raster, niente SVG che il browser eseguirebbe.
 */

const uploadSchema = z.object({
  dataUrl: z.string().min(32).max(MAX_IMAGE_DATA_URL_CHARS, "Immagine troppo pesante"),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Stesso gate della generazione e della pubblicazione: allegare media e' un
  // pezzo del Social Multiplier, non una funzione a se'.
  const accessResponse = await checkFeatureAccess(session.user.organizationId, "socialMultiplier");
  if (accessResponse) return accessResponse;

  const parsed = uploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_image", message: parsed.error.issues[0]?.message ?? "Immagine non valida." },
      { status: 400 }
    );
  }

  const decoded = decodeImageDataUrl(parsed.data.dataUrl);
  if (!decoded) {
    return NextResponse.json(
      {
        error: "unsupported_file_type",
        message: "Formato non supportato: si caricano JPG, PNG o WebP.",
      },
      { status: 415 }
    );
  }

  const storage = readStorageConfig();

  /*
   * Con lo storage configurato non si scrive nulla nel database.
   *
   * A differenza delle foto immobile, qui non c'e' una colonna che debba
   * ricordare l'URL: l'elenco degli allegati vive nella schermata finche' non
   * si pubblica. L'unica cosa che serve e' un indirizzo pubblico da passare a
   * Meta, e il bucket lo fornisce gia'.
   */
  if (storage) {
    const objectKey = `${session.user.organizationId}/social/${randomUUID()}.${extensionForMimeType(decoded.mimeType)}`;
    try {
      const publicUrl = await putObject(storage, objectKey, decoded.bytes, decoded.mimeType);
      return NextResponse.json({ url: publicUrl });
    } catch {
      // Nessun ripiego silenzioso sulla tabella: lo storage configurato che
      // rifiuta e' un guasto da vedere, non da aggirare scrivendo altrove.
      return NextResponse.json(
        { error: "storage_unavailable", message: "Caricamento non riuscito. Riprova." },
        { status: 502 }
      );
    }
  }

  const created = await prisma.socialMediaAsset.create({
    data: {
      dataUrl: parsed.data.dataUrl,
      mimeType: decoded.mimeType,
      byteSize: decoded.bytes.length,
      organizationId: session.user.organizationId,
    },
    select: { id: true },
  });

  return NextResponse.json({ url: `/api/social/media/${created.id}` });
}
