import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Cifratura dei segreti di terze parti conservati nel database.
 *
 * Serve per le credenziali del gestionale dell'agenzia: una chiave API salvata
 * in chiaro sarebbe leggibile da chiunque ottenga una copia del database — un
 * backup, un dump, un accesso di sola lettura — e permetterebbe di scrivere nel
 * gestionale dell'agenzia, non solo di leggere i nostri dati.
 *
 * AES-256-GCM: cifra e autentica insieme, così un testo cifrato manomesso viene
 * rifiutato invece di decifrarsi in qualcosa di diverso.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const PREFIX = "enc.v1";

/**
 * Chiave derivata da `ENCRYPTION_KEY`, o in mancanza da `NEXTAUTH_SECRET`.
 *
 * Il ripiego su NEXTAUTH_SECRET evita di aggiungere una variabile obbligatoria
 * a un deploy già in produzione, ma i due segreti restano separabili: chi
 * definisce ENCRYPTION_KEY ottiene una chiave indipendente, e ruotare la
 * sessione non rende illeggibili le credenziali dei gestionali.
 *
 * Il sale è fisso e non segreto: qui non protegge password riutilizzabili, ma
 * serve solo a legare la derivazione a questo scopo specifico. Un sale casuale
 * andrebbe conservato accanto al testo cifrato senza aggiungere nulla.
 */
function encryptionKey(): Buffer {
  const material = process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;

  if (!material) {
    throw new Error(
      "Cifratura non disponibile: definisci ENCRYPTION_KEY o NEXTAUTH_SECRET."
    );
  }

  return scryptSync(material, "propertytech.credentials.v1", KEY_BYTES);
}

/** Vero quando la cifratura è utilizzabile, per non offrire funzioni che fallirebbero. */
export function isEncryptionAvailable(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET);
}

/** Cifra un segreto. Il risultato è `enc.v1.<iv>.<tag>.<testo cifrato>`, in base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(
    "."
  );
}

/**
 * Decifra un segreto prodotto da `encryptSecret`.
 *
 * Restituisce `null` anziché lanciare: un valore illeggibile — perché la chiave
 * è cambiata o il dato è corrotto — deve tradursi in "integrazione da
 * riconfigurare", non nel blocco della qualificazione di un lead.
 */
export function decryptSecret(payload: string): string | null {
  // `enc.v1.<iv>.<tag>.<cifrato>` diviso su "." dà cinque elementi, non quattro:
  // il prefisso di versione contiene già un punto.
  const [namespace, version, iv, tag, encrypted] = payload.split(".");

  if (namespace !== "enc" || version !== "v1" || !iv || !tag || !encrypted) {
    // Formato non riconosciuto: si rifiuta invece di tentare di indovinarlo.
    return null;
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Mostra solo la coda di un segreto: `••••••4f2a`.
 *
 * L'agente deve poter riconoscere *quale* chiave ha configurato senza che la
 * chiave torni mai al browser.
 */
export function maskSecret(plaintext: string): string {
  const tail = plaintext.slice(-4);
  return `${"•".repeat(8)}${tail}`;
}
