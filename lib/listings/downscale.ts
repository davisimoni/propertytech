import { IMAGE_TARGET_LONG_EDGE } from "@/lib/listings/property-images";

/**
 * Riduce la foto **prima** di spedirla.
 *
 * Una foto da telefono pesa 6-10 MB: caricarla intera vorrebbe dire far
 * aspettare l'agente sulla rete mobile, che è esattamente dove si trova quando
 * esce da un sopralluogo. A 1920px di lato lungo la qualità resta quella che i
 * portali pubblicano, e il file scende sotto il mezzo megabyte.
 *
 * L'uscita è sempre JPEG: le foto di un immobile non hanno trasparenza da
 * preservare, e la conversione taglia ulteriormente il peso.
 *
 * # Perché in un modulo suo
 *
 * Perché ora la usano in due — l'editor delle foto immobile e gli allegati dei
 * post social — e la soglia oltre cui un caricamento fallisce è la stessa per
 * entrambi. Due copie divergono al primo ritocco, e a divergere sarebbe
 * proprio il numero che decide se il file passa.
 *
 * Funziona solo nel browser: usa `createImageBitmap` e `canvas`.
 */
export async function downscaleToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, IMAGE_TARGET_LONG_EDGE / longEdge);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas non disponibile");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    bitmap.close();
  }
}
