import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getMetaAppSecret } from "@/lib/social/meta";

/**
 * Cancellazione dei dati richiesta da Meta (Data Deletion Callback).
 *
 * # Cosa chiede Meta
 *
 * Quando una persona rimuove l'app dalle proprie impostazioni Facebook, Meta
 * invia a questa applicazione una `signed_request` con l'id di quell'utente e
 * si aspetta in risposta un codice di conferma e un indirizzo dove la persona
 * possa verificare lo stato della richiesta. È un requisito per superare l'App
 * Review.
 *
 * # Cosa cancelliamo davvero
 *
 * Tutto ciò che quel consenso ci ha fatto ottenere da Facebook: il
 * collegamento alla Pagina (id e nome), il profilo Instagram agganciato e il
 * token di pubblicazione cifrato. Da quel momento l'agenzia non può più
 * pubblicare finché non ricollega.
 *
 * Non tocca l'account PropertyTech dell'agenzia né i suoi lead, immobili o
 * documenti: non provengono da Facebook e non sono oggetto di questa richiesta.
 * La cancellazione dell'intero account si chiede dalla pagina `/data-deletion`.
 */

export interface RichiestaFirmata {
  userId: string;
  issuedAt: number | null;
}

/**
 * Verifica la firma di Meta ed estrae l'utente. `null` se non è autentica.
 *
 * Senza questa verifica chiunque potrebbe far cancellare il collegamento di
 * un'agenzia inviando l'id della sua Pagina: la firma HMAC con l'App Secret è
 * l'unica prova che la richiesta venga davvero da Meta.
 */
export function verificaSignedRequest(
  signedRequest: string,
  appSecret: string
): RichiestaFirmata | null {
  const [firmaBase64, payloadBase64] = signedRequest.split(".");
  if (!firmaBase64 || !payloadBase64) return null;

  let payload: { algorithm?: string; user_id?: string; issued_at?: number };
  try {
    payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  // Meta firma con HMAC-SHA256; un algoritmo diverso è una richiesta che non
  // sappiamo verificare, e va rifiutata invece che accettata al buio.
  if (payload.algorithm?.toUpperCase().replace("-", "") !== "HMACSHA256") return null;
  if (!payload.user_id) return null;

  const firma = Buffer.from(firmaBase64, "base64url");
  // La firma copre la stringa base64 del payload, non il JSON decodificato.
  const attesa = createHmac("sha256", appSecret).update(payloadBase64).digest();
  if (firma.length !== attesa.length) return null;
  if (!timingSafeEqual(firma, attesa)) return null;

  return { userId: payload.user_id, issuedAt: payload.issued_at ?? null };
}

/** Codice di conferma: corto da leggere al telefono, impossibile da indovinare. */
function generaCodice(): string {
  return randomBytes(8).toString("hex").toUpperCase();
}

export interface EsitoCancellazione {
  code: string;
  eliminati: number;
}

/**
 * Elimina i collegamenti social di quell'utente Facebook e registra l'esito.
 *
 * Zero collegamenti eliminati non è un errore: la persona può aver già
 * scollegato l'app, oppure il collegamento può essere stato creato prima che
 * registrassimo l'id dell'utente. In entrambi i casi da noi non resta nulla di
 * suo, ed è quello che la risposta deve poter dire.
 */
export async function cancellaDatiFacebook(userId: string): Promise<EsitoCancellazione> {
  const { count } = await prisma.socialConnection.deleteMany({ where: { facebookUserId: userId } });

  const richiesta = await prisma.dataDeletionRequest.create({
    data: { code: generaCodice(), facebookUserId: userId, eliminati: count },
    select: { code: true },
  });

  console.info("[META-DATA-DELETION]", { code: richiesta.code, eliminati: count });
  return { code: richiesta.code, eliminati: count };
}

/** Stato di una richiesta, per la pagina pubblica di verifica. */
export async function statoCancellazione(code: string) {
  return prisma.dataDeletionRequest.findUnique({
    where: { code },
    select: { code: true, eliminati: true, createdAt: true },
  });
}

/** L'App Secret è anche la chiave di verifica della firma. */
export function segretoVerifica(): string | null {
  return getMetaAppSecret();
}
