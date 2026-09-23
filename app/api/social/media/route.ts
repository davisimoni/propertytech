import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFeatureAccess } from "@/lib/feature-access";
import {
  MAX_IMAGE_BYTES,
  decodeImageDataUrl,
  extensionForMimeType,
} from "@/lib/listings/property-images";
import { putObject, readStorageConfig } from "@/lib/storage/object-storage";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DATA_URL_CHARS,
  isAllowedVideoMimeType,
  videoExtensionForMimeType,
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
 * Il tetto dello schema e' quello del video, il piu' alto dei due.
 *
 * Il controllo vero sul peso arriva subito dopo, quando si sa che tipo di file
 * e': validare qui col limite delle foto rifiuterebbe un video valido con il
 * messaggio sbagliato ("immagine troppo pesante" su un MP4 manda a
 * ricomprimere la cosa giusta per la ragione sbagliata).
 */
const uploadSchema = z.object({
  dataUrl: z.string().min(32).max(MAX_VIDEO_DATA_URL_CHARS, "File troppo pesante"),
});

/** Decodifica un data URI video, o `null` se non e' un video ammesso. */
function decodeVideoDataUrl(dataUrl: string): { mimeType: string; bytes: Buffer } | null {
  const separatore = dataUrl.indexOf(";base64,");
  if (!dataUrl.startsWith("data:") || separatore === -1) return null;

  const mimeType = dataUrl.slice(5, separatore).toLowerCase();
  if (!isAllowedVideoMimeType(mimeType)) return null;

  const bytes = Buffer.from(dataUrl.slice(separatore + ";base64,".length), "base64");
  return bytes.length > 0 ? { mimeType, bytes } : null;
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
  const video = decodeVideoDataUrl(parsed.data.dataUrl);

  if (video) {
    /*
     * Il video passa solo con lo storage configurato.
     *
     * Non e' una precauzione: senza bucket i byte andrebbero in
     * `SocialMediaAsset.dataUrl`, e l'indirizzo che daremmo a Meta sarebbe una
     * nostra funzione che restituisce base64 decodificato. Per un video Meta
     * pretende un indirizzo che regga richieste parziali e trasferimenti
     * lunghi: quello che otterremmo e' un rifiuto a pubblicazione avviata,
     * cioe' nel momento peggiore.
     */
    if (!storage) {
      return NextResponse.json(
        {
          error: "video_storage_required",
          message:
            "Per allegare video serve l'archivio esterno, non ancora attivo su questo ambiente. Le foto funzionano normalmente.",
        },
        { status: 415 }
      );
    }

    if (video.bytes.length > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        {
          error: "video_too_large",
          message: `Il video supera ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))} MB, il massimo che questa strada regge oggi.`,
        },
        { status: 413 }
      );
    }

    const chiave = `${session.user.organizationId}/social/${randomUUID()}.${videoExtensionForMimeType(video.mimeType)}`;
    try {
      const publicUrl = await putObject(storage, chiave, video.bytes, video.mimeType);
      return NextResponse.json({ url: publicUrl, kind: "video" });
    } catch {
      return NextResponse.json(
        { error: "storage_unavailable", message: "Caricamento non riuscito. Riprova." },
        { status: 502 }
      );
    }
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
