import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Client Prisma condiviso.
 *
 * Su Vercel ogni richiesta può atterrare su un'istanza serverless diversa, e
 * ognuna apre il proprio pool verso Postgres. Senza un tetto, poche richieste
 * in parallelo bastano a saturare i posti disponibili sul pooler di Supabase e
 * ogni query successiva fallisce con `EMAXCONNSESSION` — che si manifesta come
 * "server-side exception" su qualunque pagina, non su una in particolare.
 *
 * Due accorgimenti evitano il problema:
 *  1. `DATABASE_URL` deve puntare al pooler in **transaction mode** (porta
 *     6543 su Supabase), che restituisce la connessione a fine query invece di
 *     tenerla impegnata per tutta la sessione. La porta 5432 resta per le
 *     migrazioni, che richiedono una connessione diretta (`DIRECT_URL`).
 *  2. Il pool di ogni istanza è limitato qui sotto: una manciata di
 *     connessioni basta a servire le query in parallelo di una richiesta, e
 *     nessuna istanza può monopolizzare il pooler.
 */

/** Connessioni per istanza serverless. Le query eccedenti aspettano in coda
 *  invece di aprire nuove connessioni. */
const MAX_POOL_CONNECTIONS = 5;

/** Una connessione inattiva viene chiusa presto: su serverless le istanze
 *  restano vive a lungo senza ricevere traffico. */
const IDLE_TIMEOUT_MS = 10_000;

/** Meglio fallire in fretta con un errore chiaro che restare appesi. */
const CONNECTION_TIMEOUT_MS = 10_000;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: MAX_POOL_CONNECTIONS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

// Riutilizzo anche in produzione, non solo in sviluppo: se il modulo viene
// valutato più di una volta nella stessa istanza, un secondo client
// raddoppierebbe le connessioni aperte verso il database.
globalForPrisma.prisma = prisma;
