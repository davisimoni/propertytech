import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/leads/csv";
import {
  buildPreview,
  guessMapping,
  IMPORT_FIELDS,
  type ImportField,
} from "@/lib/leads/import-mapping";

/**
 * Importazione massiva di una rubrica in formato CSV.
 *
 * Due fasi distinte, e non una sola: `POST` legge il file e restituisce
 * l'anteprima, `PUT` scrive. Un'agenzia che carica ottocento contatti deve
 * poter vedere quali colonne sono state riconosciute *prima* di riversarli in
 * pipeline: disfare un'importazione sbagliata di ottocento schede è molto più
 * costoso che guardare un'anteprima.
 */

/** Oltre questa soglia il file non è una rubrica, è un errore. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5_000;

/** Riferimento immobile per un contatto che arriva dalla rubrica, non da un annuncio. */
const IMPORTED_PROPERTY_REF = "Da rubrica importata";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/** Lettura del file caricato, comune alle due fasi. */
async function readCsv(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    return { error: "Nessun file caricato." as const };
  }

  if (file.size > MAX_FILE_BYTES) {
    return { error: "Il file supera i 2 MB. Esporta la rubrica a blocchi." as const };
  }

  const text = await file.text();
  const table = parseCsv(text);

  if (table.headers.length === 0) {
    return { error: "Il file sembra vuoto o non è un CSV valido." as const };
  }

  if (table.rows.length > MAX_ROWS) {
    return {
      error: `Il file contiene più di ${MAX_ROWS} righe. Dividilo in più file.` as const,
    };
  }

  return { table };
}

/**
 * Fase 1 — anteprima.
 *
 * Non scrive nulla: dice cosa succederebbe. Include i primi contatti
 * riconosciuti, perché vedere "Mario Rossi · 393331234567" è l'unico modo
 * rapido per accorgersi che le colonne sono state abbinate male.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return unauthorized();

  const result = await readCsv(request);
  if ("error" in result) {
    return NextResponse.json({ error: "invalid_file", message: result.error }, { status: 400 });
  }

  const { table } = result;
  const mapping = guessMapping(table.headers);
  const preview = buildPreview(table.rows, mapping);

  // Quanti sono già in archivio: l'agenzia deve sapere che ricaricare lo stesso
  // file non raddoppia le schede.
  const existing = preview.valid.length
    ? await prisma.lead.count({
        where: {
          organizationId: session.user.organizationId,
          clientPhone: { in: preview.valid.map((row) => row.clientPhone) },
        },
      })
    : 0;

  return NextResponse.json({
    headers: table.headers,
    delimiter: table.delimiter,
    mapping,
    totalRows: table.rows.length,
    validCount: preview.valid.length,
    duplicatesInFile: preview.duplicatesInFile,
    alreadyPresent: existing,
    willCreate: Math.max(0, preview.valid.length - existing),
    // Solo i primi cinque: l'anteprima serve a riconoscere un errore di
    // abbinamento, non a rileggere l'intera rubrica nel browser.
    sample: preview.valid.slice(0, 5),
    skipped: preview.skipped.slice(0, 20),
    skippedTotal: preview.skipped.length,
  });
}

const mappingSchema = z.record(
  z.string().regex(/^\d+$/),
  z.enum(IMPORT_FIELDS as [ImportField, ...ImportField[]])
);

/**
 * Fase 2 — scrittura.
 *
 * La mappatura arriva dal client perché l'agente può averla corretta
 * nell'anteprima; è però rivalidata qui, e le chiavi che non sono indici di
 * colonna vengono rifiutate.
 */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return unauthorized();

  const organizationId = session.user.organizationId;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const rawMapping = form?.get("mapping");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "invalid_file", message: "Nessun file caricato." }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "invalid_file", message: "Il file supera i 2 MB." },
      { status: 400 }
    );
  }

  let mapping: Record<number, ImportField>;
  try {
    const parsed = mappingSchema.parse(JSON.parse(String(rawMapping ?? "{}")));
    mapping = Object.fromEntries(
      Object.entries(parsed).map(([index, field]) => [Number(index), field])
    );
  } catch {
    return NextResponse.json(
      { error: "invalid_mapping", message: "Abbinamento delle colonne non valido." },
      { status: 400 }
    );
  }

  const table = parseCsv(await file.text());
  if (table.headers.length === 0 || table.rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: "invalid_file", message: "File vuoto o troppo grande." },
      { status: 400 }
    );
  }

  const preview = buildPreview(table.rows, mapping);

  if (preview.valid.length === 0) {
    return NextResponse.json(
      {
        error: "nothing_to_import",
        message: "Nessuna riga importabile: controlla l'abbinamento di nome e telefono.",
      },
      { status: 400 }
    );
  }

  // `createMany` con `skipDuplicates`: il vincolo unico
  // [organizationId, clientPhone] fa il resto. Farlo in una sola istruzione
  // invece che riga per riga evita ottocento andate e ritorni al database, e
  // soprattutto evita che un errore a metà lasci un'importazione dimezzata.
  const created = await prisma.lead.createMany({
    data: preview.valid.map((row) => ({
      organizationId,
      clientName: row.clientName,
      clientPhone: row.clientPhone,
      clientEmail: row.clientEmail,
      budget: row.budget,
      preferredZone: row.preferredZone,
      propertyRef: IMPORTED_PROPERTY_REF,
      portalSource: "IMPORT" as const,
      // Non parte nessuna conversazione: importare una rubrica non è consenso
      // a scrivere su WhatsApp a ottocento persone (GDPR, e prima ancora
      // buon senso commerciale). L'agente ingaggia chi decide lui.
      qualificationStatus: "PENDING" as const,
    })),
    skipDuplicates: true,
  });

  return NextResponse.json({
    imported: created.count,
    skipped: preview.skipped.length,
    duplicates: preview.valid.length - created.count + preview.duplicatesInFile,
  });
}
