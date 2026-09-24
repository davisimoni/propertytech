import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { checkFeatureAccess } from "@/lib/feature-access";
import { presignPutUrl, readStorageConfig } from "@/lib/storage/object-storage";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_VIDEO_BYTES,
  isAllowedVideoMimeType,
  videoExtensionForMimeType,
} from "@/lib/social/media-limits";

/**
 * Indirizzo prefirmato per caricare un video direttamente nel bucket.
 *
 * # Perché il file non passa da qui
 *
 * Perché non ci starebbe: il corpo di una funzione serverless si ferma a
 * 4,5 MB e un data URI gonfia i byte di un terzo, quindi da questa strada
 * passerebbero dieci secondi di clip. Con l'indirizzo prefirmato il browser
 * scrive nel bucket e la nostra funzione resta un ufficio che firma un
 * permesso: restituisce in pochi millisecondi e non vede mai i byte.
 *
 * # Cosa il permesso NON consente
 *
 * - **Di scegliere dove scrivere.** La chiave la genera questa rotta dentro il
 *   prefisso dell'agenzia: se arrivasse dal browser, chiunque potrebbe
 *   sovrascrivere i file di un'altra agenzia passando la sua chiave.
 * - **Di superare la dimensione dichiarata.** `content-length` entra nella
 *   firma, quindi il fornitore rifiuta un file più grande di quello per cui il
 *   permesso è stato emesso. Senza, un indirizzo prefirmato sarebbe una
 *   scrittura di dimensione illimitata nel nostro bucket.
 * - **Di restare valido.** Scade in quindici minuti.
 *
 * # Perché non serve un passaggio di conferma
 *
 * Perché non c'è niente da registrare: l'indirizzo pubblico si ricava dalla
 * chiave, e l'elenco degli allegati vive nella schermata finché non si
 * pubblica (come per le foto). Un file caricato e mai pubblicato resta nel
 * bucket: è il prezzo di questa semplicità, e lo si paga in spazio, non in
 * correttezza.
 */

const schema = z.object({
  contentType: z.string().trim().min(3).max(100),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(MAX_VIDEO_BYTES, `Il video supera ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))} MB.`),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Stesso gate del resto del modulo: allegare media è un pezzo del Social
  // Multiplier, non una funzione a sé.
  const accessResponse = await checkFeatureAccess(session.user.organizationId, "socialMultiplier");
  if (accessResponse) return accessResponse;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }

  const { contentType, byteSize } = parsed.data;

  if (!isAllowedVideoMimeType(contentType)) {
    return NextResponse.json(
      {
        error: "unsupported_file_type",
        message: `Formato video non supportato: si caricano ${ALLOWED_VIDEO_MIME_TYPES.join(" o ")}.`,
      },
      { status: 415 }
    );
  }

  const storage = readStorageConfig();
  if (!storage) {
    return NextResponse.json(
      {
        error: "video_storage_required",
        message: "L'archivio esterno non è configurato su questo ambiente. Le foto funzionano.",
      },
      { status: 415 }
    );
  }

  const objectKey = `${session.user.organizationId}/social/${randomUUID()}.${videoExtensionForMimeType(contentType)}`;

  const { uploadUrl, publicUrl } = presignPutUrl({ config: storage, objectKey, byteSize });

  return NextResponse.json({ uploadUrl, publicUrl, kind: "video" });
}
