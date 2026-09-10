import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parsePropertyCsv, type RowError } from "@/lib/listings/csv-import";
import { runMatchingForProperty } from "@/lib/matching/run-matching";

/** Oltre questa soglia il file probabilmente non è un portafoglio, è un errore di caricamento. */
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

/** Righe dati oltre le quali l'import va spezzato in più file: un limite protettivo, non di piano. */
const MAX_ROWS = 500;

/**
 * Import CSV del portafoglio: ogni riga valida viene salvata con lo stesso
 * `upsert` sul riferimento della creazione singola (`/api/properties`), così
 * ricaricare lo stesso file dopo una correzione aggiorna invece di duplicare.
 * Le righe non valide non bloccano le altre: l'agente vede quali correggere
 * e ricarica solo quelle, non l'intero file.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const organizationId = session.user.organizationId;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "invalid_payload", message: "Allega il file CSV." },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "Il file supera i 2 MB: dividilo in più caricamenti." },
      { status: 413 }
    );
  }

  const text = await file.text();
  const { valid, errors: parseErrors, headerMismatch } = parsePropertyCsv(text);

  if (headerMismatch) {
    return NextResponse.json(
      {
        error: "header_mismatch",
        message:
          "Le colonne non corrispondono al modello. Scarica di nuovo il template e non modificare i nomi delle colonne.",
      },
      { status: 400 }
    );
  }

  const rows = valid.slice(0, MAX_ROWS);
  const truncated = valid.length > MAX_ROWS;

  const saveErrors: RowError[] = [...parseErrors];
  let imported = 0;

  for (const row of rows) {
    try {
      const { title, description, ...fields } = row.data;
      const property = await prisma.property.upsert({
        where: { organizationId_reference: { organizationId, reference: fields.reference } },
        create: { organizationId, title, description, ...fields },
        update: { title, description, ...fields },
      });
      imported++;
      // Accessorio: se il matching fallisce l'immobile resta comunque salvato.
      await runMatchingForProperty(property).catch(() => {});
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        saveErrors.push({
          line: row.line,
          reference: row.data.reference,
          message: "Salvataggio non riuscito.",
        });
        continue;
      }
      throw error;
    }
  }

  return NextResponse.json({
    imported,
    errors: saveErrors,
    truncated,
  });
}
