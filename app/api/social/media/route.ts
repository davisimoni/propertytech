import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFeatureAccess } from "@/lib/feature-access";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DATA_URL_CHARS,
  decodeImageDataUrl,
  extensionForMimeType,
} from "@/lib/listings/property-images";
import { putObject, readStorageConfig } from "@/lib/storage/object-storage";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_VIDEO_BYTES,
  isAllowedVideoMimeType,
} from "@/lib/social/media-limits";

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

/*
 * Questa rotta porta **solo foto**, e il tetto e' quello delle foto.
 *
 * I video non passano di qui: viaggiano diretti al bucket con un indirizzo
 * prefirmato (`/api/social/media/presign`), perche' il corpo di una funzione
 * serverless si ferma a 4,5 MB e un data URI gonfia i byte di un terzo. Due
 * strade separate e non una piu' grande: cosi' il limite di ciascuna e' quello
 * vero, e non il minimo fra i due.
 */
const uploadSchema = z.object({
  dataUrl: z.string().min(32).max(MAX_IMAGE_DATA_URL_CHARS, "Immagine troppo pesante"),
});

/** Vero se il data URI dichiara un video: qui non e' il posto giusto. */
function dichiaraVideo(dataUrl: string): boolean {
  const separatore = dataUrl.indexOf(";base64,");
  if (separatore === -1) return false;
  return isAllowedVideoMimeType(dataUrl.slice(5, separatore));
}

/**
 * Cosa questa rotta sa accettare, per chi deve dirlo all'agente **prima** che
 * scelga il file.
 *
 * Senza object storage il video non ha dove stare: i byte finirebbero in una
 * colonna PostgreSQL e Meta dovrebbe scaricarli attraverso una nostra funzione,
 * che per un video non regge. Meglio che il pannello lo sappia in apertura
 * invece di far scoprire il limite a chi ha appena trascinato un file.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    videoSupported: readStorageConfig() !== null,
    videoMimeTypes: ALLOWED_VIDEO_MIME_TYPES,
    maxVideoBytes: MAX_VIDEO_BYTES,
  });
}

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

  const storage = readStorageConfig();

  if (dichiaraVideo(parsed.data.dataUrl)) {
    // Non dovrebbe succedere dal nostro pannello, che per i video chiede
    // l'indirizzo prefirmato. Se succede, e' un client vecchio o costruito a
    // mano: meglio dirgli dove andare che accettare 4 MB di base64.
    return NextResponse.json(
      {
        error: "use_presigned_upload",
        message: "I video si caricano dall'indirizzo dedicato. Ricarica la pagina e riprova.",
      },
      { status: 415 }
    );
  }

  const decoded = decodeImageDataUrl(parsed.data.dataUrl);
  if (!decoded) {
    return NextResponse.json(
      {
        error: "unsupported_file_type",
        message: "Formato non supportato: si caricano JPG, PNG, WebP, MP4 o MOV.",
      },
      { status: 415 }
    );
  }

  if (decoded.bytes.length > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "image_too_large", message: "Immagine troppo pesante." },
      { status: 413 }
    );
  }

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
      return NextResponse.json({ url: publicUrl, kind: "image" });
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

  return NextResponse.json({ url: `/api/social/media/${created.id}`, kind: "image" });
}
