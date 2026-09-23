import "server-only";
import { prisma } from "@/lib/prisma";
import { kindFromExtension, type MediaAllegato, type MediaKind } from "@/lib/social/media-limits";

/**
 * Da un elenco di indirizzi agli allegati con il proprio tipo.
 *
 * # Perché il tipo lo decide il server
 *
 * Perché su quel dato si sceglie quale endpoint di Meta chiamare: `/photos` o
 * `/videos`, contenitore immagine o `REELS`. Se lo dichiarasse il browser,
 * basterebbe una richiesta costruita a mano per far passare una foto
 * all'endpoint dei video e ottenere un errore incomprensibile, o peggio per far
 * scaricare a Meta un indirizzo qualsiasi dichiarandolo video.
 *
 * # Perché non basta l'estensione
 *
 * Senza object storage un allegato vive su `/api/social/media/<id>`, che di
 * estensione non ne ha: il tipo sta nella riga `SocialMediaAsset`. Con lo
 * storage configurato l'indirizzo è quello del bucket e l'estensione la
 * scriviamo noi al caricamento, quindi lì è affidabile. Due strade, e questa
 * funzione è il posto in cui si sa quale prendere.
 *
 * La lettura filtra su `organizationId`: l'id di un allegato di un'altra
 * agenzia non deve nemmeno rivelare di che tipo sia.
 */

/** `/api/social/media/<id>` — gli allegati salvati nel database. */
const INTERNO = /^\/api\/social\/media\/([A-Za-z0-9_-]+)$/;

export async function risolviAllegati(
  organizationId: string,
  urls: string[]
): Promise<MediaAllegato[]> {
  const idInterni = urls
    .map((url) => INTERNO.exec(url)?.[1])
    .filter((id): id is string => Boolean(id));

  const tipiPerId = new Map<string, MediaKind>();

  if (idInterni.length > 0) {
    const righe = await prisma.socialMediaAsset.findMany({
      where: { id: { in: idInterni }, organizationId },
      select: { id: true, mimeType: true },
    });

    for (const riga of righe) {
      tipiPerId.set(riga.id, riga.mimeType.startsWith("video/") ? "video" : "image");
    }
  }

  return urls.map((url) => {
    const id = INTERNO.exec(url)?.[1];

    if (id) {
      /*
       * Un id non trovato vale "immagine", non un errore.
       *
       * Non trovarlo significa che la riga non esiste o è di un'altra agenzia:
       * in entrambi i casi la pubblicazione fallirà comunque quando Meta
       * proverà a scaricare l'indirizzo. Rifiutare qui con un messaggio sul
       * "tipo" manderebbe a cercare un problema di formato dove c'è un
       * allegato che non c'è.
       */
      return { url, kind: tipiPerId.get(id) ?? "image" };
    }

    return { url, kind: kindFromExtension(url) };
  });
}
