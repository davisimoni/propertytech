/**
 * Verifica l'object storage con un giro completo: carica, rilegge, cancella.
 *
 * # Perché serve un comando e non uno sguardo alle variabili
 *
 * Perché le cose che rompono uno storage S3 non si vedono leggendo la
 * configurazione. Le tre più frequenti, tutte con lo stesso sintomo (un 403
 * opaco al primo caricamento di una foto):
 *
 *  - **nomi diversi**: `readStorageConfig()` legge `STORAGE_BUCKET_URL`,
 *    `STORAGE_ACCESS_KEY` e `STORAGE_SECRET_KEY`, mentre i fornitori li
 *    chiamano `ENDPOINT`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`. Un nome
 *    sbagliato non è un errore: la funzione torna `null` e l'app ripiega in
 *    silenzio sulla tabella locale;
 *  - **regione sbagliata**: entra nella firma SigV4, e se non corrisponde il
 *    fornitore rifiuta. L'errore di AWS dice quale si aspettava, ed è per
 *    questo che qui il dettaglio si stampa;
 *  - **bucket non pubblico**: il caricamento riesce e la lettura no. Non è un
 *    dettaglio: a scaricare quei file sono i server di Meta, e un bucket
 *    privato fa fallire la pubblicazione, non il caricamento.
 *
 * # Uso
 *
 *   set -a && source .env.local && set +a
 *   export NODE_OPTIONS="--conditions=react-server"
 *   npx --yes tsx scripts/verifica-storage.ts
 *
 * Non stampa mai le credenziali: solo l'host, la regione e l'esito.
 */

import { randomUUID } from "node:crypto";
import {
  deleteObject,
  putObject,
  readStorageConfig,
} from "../lib/storage/object-storage";
import { MAX_VIDEO_BYTES } from "../lib/social/media-limits";

const CONTENUTO = Buffer.from("verifica PropertyTech: questo file viene cancellato subito.\n");

async function main(): Promise<void> {
  const config = readStorageConfig();

  if (!config) {
    console.error(
      "\n✘ Storage non configurato.\n\n" +
        "Mancano STORAGE_BUCKET_URL, STORAGE_ACCESS_KEY o STORAGE_SECRET_KEY.\n" +
        "Attenzione ai nomi: quelli del fornitore (ENDPOINT, ACCESS_KEY_ID,\n" +
        "SECRET_ACCESS_KEY, BUCKET_NAME) vanno mappati su questi.\n"
    );
    process.exit(1);
  }

  console.log("\nConfigurazione letta:");
  console.log(`  endpoint: ${new URL(config.bucketUrl).host}${new URL(config.bucketUrl).pathname}`);
  console.log(`  indirizzo pubblico: ${new URL(config.publicUrl).host}`);
  console.log(`  regione: ${config.region}`);
  console.log(`  chiavi: presenti`);

  const chiave = `verifica/${randomUUID()}.txt`;

  console.log("\n1. Caricamento (PUT firmata SigV4):");
  let urlPubblico: string;
  try {
    urlPubblico = await putObject(config, chiave, CONTENUTO, "text/plain");
    console.log(`  ✔ caricato: ${chiave}`);
  } catch (errore) {
    console.error(`  ✘ ${errore instanceof Error ? errore.message : errore}`);
    console.error(
      "\n  Il dettaglio del fornitore è nella riga [storage] qui sopra. Se parla di\n" +
        "  regione, copia quella che si aspetta in STORAGE_REGION.\n"
    );
    process.exit(1);
  }

  console.log("\n2. Lettura dall'indirizzo pubblico (come farebbe Meta):");
  const risposta = await fetch(urlPubblico, { signal: AbortSignal.timeout(20_000) });
  const testo = await risposta.text().catch(() => "");

  if (!risposta.ok) {
    console.error(`  ✘ HTTP ${risposta.status}`);
    console.error(
      "\n  Il file è stato caricato ma non è leggibile da fuori: il bucket non è\n" +
        "  pubblico. I server di Meta scaricano da questo indirizzo, quindi con un\n" +
        "  bucket privato la pubblicazione fallisce anche se il caricamento riesce.\n"
    );
  } else if (testo.trim() !== CONTENUTO.toString().trim()) {
    console.error("  ✘ Il contenuto letto non corrisponde a quello caricato.");
  } else {
    console.log(`  ✔ HTTP 200, contenuto identico`);
  }

  console.log("\n3. Pulizia:");
  await deleteObject(config, chiave);

  /*
   * Il controllo dopo la cancellazione va fatto **aggirando la cache**.
   *
   * Gli indirizzi pubblici di Supabase passano da una CDN: una lettura subito
   * dopo la DELETE torna 200 dalla copia in cache, e sembra che la
   * cancellazione non sia avvenuta. Era un falso allarme, ma di quelli che
   * costano mezz'ora: `deleteObject` non aveva registrato nessun rifiuto, e
   * infatti l'oggetto era già sparito.
   *
   * Un oggetto assente su Supabase risponde **400**, non 404: contano
   * entrambi come rimosso.
   */
  const dopo = await fetch(`${urlPubblico}?cb=${Date.now()}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  console.log(
    dopo && dopo.ok
      ? `  ⚠ il file risulta ancora leggibile: cancellalo a mano (${chiave})`
      : "  ✔ file rimosso"
  );

  if (risposta.ok) {
    const tetto = Math.round(MAX_VIDEO_BYTES / (1024 * 1024));
    console.log("\n✔ Storage utilizzabile: caricamento e lettura pubblica funzionano.");
    console.log(
      `  Il pannello allegati di /social ora accetta anche MP4 e MOV (max ${tetto} MB per video,\n` +
        "  limite del corpo delle funzioni serverless, non dello storage).\n"
    );
  } else {
    console.log("\n✘ Storage configurato ma non utilizzabile per Meta: manca la lettura pubblica.\n");
  }
}

main()
  .then(() => process.exit(0))
  .catch((errore) => {
    console.error("Errore:", errore instanceof Error ? errore.message : errore);
    process.exit(1);
  });
