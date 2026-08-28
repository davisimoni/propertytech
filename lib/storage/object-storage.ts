import "server-only";
import { createHash, createHmac } from "node:crypto";
import { readSecret } from "@/lib/env";

/**
 * Object storage compatibile S3, per le fotografie degli annunci.
 *
 * # Perché serve
 *
 * I byte delle foto stanno oggi in PostgreSQL. Regge il portafoglio di
 * un'agenzia che parte, non un archivio a regime: venti foto per immobile, a
 * qualche centinaio di kilobyte l'una, riempiono il database con dati che un
 * database non ha motivo di custodire e che rallentano ogni backup.
 *
 * # Perché la firma è scritta a mano
 *
 * Bastano una PUT e una DELETE. L'SDK AWS pesa alcuni megabyte, arriva con
 * decine di dipendenze transitive e va aggiornato per sempre: per due
 * richieste, la firma SigV4 è meno codice di quanto costi mantenerlo. In
 * cambio funziona identica su Amazon S3, Cloudflare R2 e Supabase Storage, che
 * espongono tutti lo stesso protocollo.
 *
 * # Non configurato non è un guasto
 *
 * Senza le variabili d'ambiente `isObjectStorageConfigured()` torna `false` e
 * il caricamento resta sulla tabella locale. È lo stesso principio del seam
 * Speech-to-Text: la funzione non deve sparire perché manca una chiave, deve
 * degradare a ciò che sa fare senza.
 */

export interface StorageConfig {
  /** Base del bucket, es. `https://<account>.r2.cloudflarestorage.com/<bucket>`. */
  bucketUrl: string;
  accessKey: string;
  secretKey: string;
  /** `auto` va bene per R2; S3 vuole la regione vera. */
  region: string;
  /**
   * Base pubblica da cui i portali scaricano, quando è diversa dall'endpoint
   * di caricamento (su R2 lo è quasi sempre: si carica su
   * `*.r2.cloudflarestorage.com` e si serve da un dominio collegato).
   */
  publicUrl: string;
}

export function readStorageConfig(): StorageConfig | null {
  const bucketUrl = readSecret("STORAGE_BUCKET_URL");
  const accessKey = readSecret("STORAGE_ACCESS_KEY");
  const secretKey = readSecret("STORAGE_SECRET_KEY");

  if (!bucketUrl || !accessKey || !secretKey) return null;

  const trimmed = bucketUrl.replace(/\/+$/, "");

  return {
    bucketUrl: trimmed,
    accessKey,
    secretKey,
    region: readSecret("STORAGE_REGION") || "auto",
    publicUrl: (readSecret("STORAGE_PUBLIC_URL") || trimmed).replace(/\/+$/, ""),
  };
}

export function isObjectStorageConfigured(): boolean {
  return readStorageConfig() !== null;
}

const sha256Hex = (data: string | Buffer): string =>
  createHash("sha256").update(data).digest("hex");

const hmac = (key: Buffer | string, data: string): Buffer =>
  createHmac("sha256", key).update(data, "utf8").digest();

/**
 * Chiave di firma derivata: data → regione → servizio → `aws4_request`.
 *
 * La catena è quella prescritta da SigV4; il punto è che la chiave segreta non
 * firma mai direttamente la richiesta, così una chiave derivata trapelata vale
 * al massimo un giorno e una regione.
 */
function signingKey(secret: string, date: string, region: string, service: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), service), "aws4_request");
}

/**
 * Costruisce l'header `Authorization` per una richiesta S3.
 *
 * Esportata per poter essere collaudata contro i vettori di prova pubblicati
 * da AWS: una firma sbagliata si manifesta come un 403 opaco dal fornitore, e
 * senza un test deterministico si finisce a indovinare.
 */
export function buildAuthorizationHeader(params: {
  method: string;
  /** Percorso già codificato, con lo slash iniziale. */
  path: string;
  query: string;
  headers: Record<string, string>;
  payloadHash: string;
  accessKey: string;
  secretKey: string;
  region: string;
  service?: string;
  amzDate: string;
}): string {
  const service = params.service ?? "s3";
  const shortDate = params.amzDate.slice(0, 8);

  const sortedKeys = Object.keys(params.headers)
    .map((key) => key.toLowerCase())
    .sort();

  const lowerHeaders = Object.fromEntries(
    Object.entries(params.headers).map(([key, value]) => [key.toLowerCase(), value.trim()])
  );

  const canonicalHeaders = sortedKeys.map((key) => `${key}:${lowerHeaders[key]}\n`).join("");
  const signedHeaders = sortedKeys.join(";");

  const canonicalRequest = [
    params.method,
    params.path,
    params.query,
    canonicalHeaders,
    signedHeaders,
    params.payloadHash,
  ].join("\n");

  const scope = `${shortDate}/${params.region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    params.amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(params.secretKey, shortDate, params.region, service)
  )
    .update(stringToSign, "utf8")
    .digest("hex");

  return `AWS4-HMAC-SHA256 Credential=${params.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

/**
 * Carica un oggetto e restituisce l'URL pubblico da cui si scarica.
 *
 * `objectKey` non deve mai arrivare da un utente: qui riceve un identificativo
 * generato da noi, così non c'è modo di scrivere fuori dal prefisso previsto
 * o di sovrascrivere l'oggetto di un'altra agenzia.
 */
export async function putObject(
  config: StorageConfig,
  objectKey: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const url = new URL(`${config.bucketUrl}/${objectKey}`);
  const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
  const payloadHash = sha256Hex(body);

  const headers: Record<string, string> = {
    host: url.host,
    "content-type": contentType,
    "content-length": String(body.length),
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  const authorization = buildAuthorizationHeader({
    method: "PUT",
    path: url.pathname,
    query: "",
    headers,
    payloadHash,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
    region: config.region,
    amzDate,
  });

  const response = await fetch(url, {
    method: "PUT",
    headers: { ...headers, Authorization: authorization },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[storage] Caricamento rifiutato", {
      status: response.status,
      detail: detail.slice(0, 300),
    });
    throw new StorageError(`Caricamento non riuscito (HTTP ${response.status}).`);
  }

  return `${config.publicUrl}/${objectKey}`;
}

/** Rimuove un oggetto. Non lancia: una foto orfana costa meno di un errore in UI. */
export async function deleteObject(config: StorageConfig, objectKey: string): Promise<void> {
  try {
    const url = new URL(`${config.bucketUrl}/${objectKey}`);
    const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
    const payloadHash = sha256Hex("");

    const headers: Record<string, string> = {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };

    const authorization = buildAuthorizationHeader({
      method: "DELETE",
      path: url.pathname,
      query: "",
      headers,
      payloadHash,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      region: config.region,
      amzDate,
    });

    const response = await fetch(url, {
      method: "DELETE",
      headers: { ...headers, Authorization: authorization },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok && response.status !== 404) {
      console.error("[storage] Cancellazione rifiutata", { status: response.status });
    }
  } catch (error) {
    console.error("[storage] Cancellazione non riuscita", { error });
  }
}

/**
 * Estrae la chiave dell'oggetto da un URL pubblico prodotto da `putObject`.
 *
 * `null` per gli URL che non appartengono al nostro bucket: sono foto arrivate
 * da un'altra strada, e provare a cancellarle su questo storage non avrebbe
 * senso.
 */
export function objectKeyFromUrl(config: StorageConfig, url: string): string | null {
  const prefix = `${config.publicUrl}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}
