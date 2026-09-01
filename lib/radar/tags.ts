import type { AuctionStatus } from "@prisma/client";

/**
 * Etichette di un lotto e fase della vendita.
 *
 * # Perché un insieme chiuso e non testo libero
 *
 * I tag servono a filtrare. Con la scrittura libera nascono "reddito", "a
 * reddito" e "Reddito" come tre categorie diverse, e il filtro smette di
 * restituire quello che l'agente si aspetta — che è l'unico motivo per cui i
 * tag esistono. Un elenco chiuso si allunga con una riga qui il giorno in cui
 * serve davvero.
 *
 * # Perché non ci sono "Occupato" e "Libero"
 *
 * Quel dato lo produce già la perizia (`AuctionAppraisal.occupancy`) ed è
 * mostrato in scheda e sul semaforo. Un'etichetta scritta a mano che dice il
 * contrario lascerebbe l'agente davanti a due risposte senza sapere quale
 * credere — e su un lotto all'asta è la differenza fra entrare in casa e
 * avviare uno sgombero.
 */

export const RADAR_TAGS = [
  "Ottimo flip",
  "A reddito",
  "Da ristrutturare",
  "Chiavi in mano",
  "Zona richiesta",
  "Prima casa",
] as const;

export type RadarTag = (typeof RADAR_TAGS)[number];

export function isRadarTag(value: string): value is RadarTag {
  return (RADAR_TAGS as readonly string[]).includes(value);
}

export const AUCTION_STATUS_LABELS: Record<AuctionStatus, string> = {
  IN_ARRIVO: "In arrivo",
  ATTIVA: "Asta attiva",
  DESERTA: "Deserta",
  AGGIUDICATA: "Aggiudicata",
};

/**
 * Stile della fase.
 *
 * "Deserta" è verde e non grigia: una vendita andata deserta si ripresenta a
 * prezzo ribassato, ed è il momento in cui conviene guardarla. Trattarla come
 * una pratica chiusa la farebbe scorrere via proprio quando diventa
 * interessante.
 */
export const AUCTION_STATUS_CLASSES: Record<AuctionStatus, string> = {
  IN_ARRIVO: "bg-primary/10 text-primary",
  ATTIVA: "bg-status-pending/10 text-status-pending",
  DESERTA: "bg-status-qualified/10 text-status-qualified",
  AGGIUDICATA: "bg-muted text-muted-foreground",
};
