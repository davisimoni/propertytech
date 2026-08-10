import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

/**
 * In sviluppo i segreti stanno in `.env.local`; in produzione (Vercel, CI) quel
 * file non esiste — è escluso da git — e le variabili arrivano dalla
 * piattaforma.
 *
 * Il caricamento è volutamente difensivo: `existsSync` da solo non basta,
 * perché il percorso è relativo alla directory di lavoro e `prisma generate`
 * gira anche da `postinstall`, dove la cwd non coincide necessariamente con la
 * radice del progetto. Un errore qui bloccherebbe l'installazione delle
 * dipendenze, che è esattamente ciò che non deve succedere: mancare i segreti
 * locali non è un problema quando i valori arrivano da altrove.
 */
function loadLocalEnvFile(): void {
  try {
    if (typeof process.loadEnvFile !== "function") return;
    if (!existsSync(".env.local")) return;

    process.loadEnvFile(".env.local");
  } catch {
    // File assente, illeggibile o sparito fra il controllo e la lettura.
  }
}

loadLocalEnvFile();

/**
 * `prisma generate` non ha bisogno di un database raggiungibile: gli serve solo
 * lo schema. Il datasource si dichiara quindi solo quando l'URL c'è davvero,
 * altrimenti la generazione del client fallirebbe durante l'installazione su
 * una piattaforma che inietta le variabili solo nella fase di build.
 *
 * I comandi che il database lo toccano per davvero — `migrate`, `db push` —
 * richiedono comunque `DATABASE_URL` e falliscono con un messaggio esplicito
 * se manca, quindi omettere il campo qui non nasconde nulla.
 */
/**
 * Le migrazioni richiedono una connessione **diretta**: creano tipi, tabelle e
 * indici, operazioni che un pooler in transaction mode non sa gestire perché
 * restituisce la connessione a ogni statement. `DIRECT_URL` punta quindi alla
 * porta di sessione (5432 su Supabase), mentre l'applicazione a runtime usa
 * `DATABASE_URL` sul pooler (6543).
 *
 * Il fallback su `DATABASE_URL` mantiene funzionanti gli ambienti in cui una
 * sola URL è configurata, come lo sviluppo su un Postgres locale.
 */
const migrationUrl = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(migrationUrl
    ? { datasource: { url: env(process.env.DIRECT_URL?.trim() ? "DIRECT_URL" : "DATABASE_URL") } }
    : {}),
});
