import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFeatureAccess } from "@/lib/feature-access";
import {
  computeRetentionUntil,
  isAllowedDataUrl,
  MAX_FILE_BYTES,
  MAX_FILE_DATA_URL_CHARS,
  formatFileSize,
} from "@/lib/documents/vault";

/**
 * Fascicolo documentale di un immobile o di un cliente.
 *
 * Ogni query filtra su `organizationId` preso dalla sessione, mai dal corpo
 * della richiesta: è il confine del multi-tenancy (CLAUDE.md §5), e un id di
 * organizzazione accettato dal client sarebbe la fine dell'isolamento.
 */

const documentCategories = [
  "IDENTITA",
  "CODICE_FISCALE",
  "VISURA_CATASTALE",
  "PLANIMETRIA",
  "ATTO_PROVENIENZA",
  "APE",
  "MANDATO",
  "PROPOSTA",
  "COMPROMESSO",
  "CONFORMITA_IMPIANTI",
  "ALTRO",
] as const;

const createSchema = z
  .object({
    title: z.string().trim().min(1, "Dai un nome al documento").max(160),
    category: z.enum(documentCategories),
    notes: z.string().trim().max(1000).optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    fileDataUrl: z.string().max(MAX_FILE_DATA_URL_CHARS, "Il file supera i 5 MB").nullable().optional(),
    fileName: z.string().trim().max(255).nullable().optional(),
    fileSize: z.number().int().min(0).max(MAX_FILE_BYTES).nullable().optional(),
    leadId: z.string().min(1).max(60).nullable().optional(),
    propertyId: z.string().min(1).max(60).nullable().optional(),
  })
  // Un documento senza fascicolo non è ritrovabile da nessuna parte: tanto
  // varrebbe non averlo caricato.
  .refine((data) => Boolean(data.leadId) || Boolean(data.propertyId), {
    message: "Collega il documento a un immobile o a un cliente",
    path: ["propertyId"],
  });

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;

  const gate = await checkFeatureAccess(organizationId, "documentVault");
  if (gate) return gate;

  const url = new URL(request.url);
  const leadId = url.searchParams.get("leadId");
  const propertyId = url.searchParams.get("propertyId");

  const documents = await prisma.agencyDocument.findMany({
    where: {
      organizationId,
      ...(leadId ? { leadId } : {}),
      ...(propertyId ? { propertyId } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    // Limite esplicito: senza, il fascicolo di un'agenzia a regime restituisce
    // tutto in una volta e la pagina cresce senza un tetto.
    take: 200,
    // `fileDataUrl` volutamente escluso: l'elenco di venti documenti
    // trascinerebbe decine di megabyte di base64 dentro la pagina. Il
    // contenuto si scarica uno alla volta, dalla rotta dedicata.
    select: {
      id: true,
      title: true,
      category: true,
      notes: true,
      expiresAt: true,
      retentionUntil: true,
      fileName: true,
      fileSize: true,
      createdAt: true,
      leadId: true,
      propertyId: true,
      uploadedBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  return NextResponse.json({
    documents: documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
      notes: doc.notes,
      expiresAt: doc.expiresAt?.toISOString() ?? null,
      retentionUntil: doc.retentionUntil.toISOString(),
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      hasFile: doc.fileName !== null,
      createdAt: doc.createdAt.toISOString(),
      leadId: doc.leadId,
      propertyId: doc.propertyId,
      uploadedByName: doc.uploadedBy
        ? [doc.uploadedBy.firstName, doc.uploadedBy.lastName].filter(Boolean).join(" ") ||
          doc.uploadedBy.email
        : null,
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;

  const gate = await checkFeatureAccess(organizationId, "documentVault");
  if (gate) return gate;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", message: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }

  const { title, category, notes, expiresAt, fileDataUrl, fileName, fileSize, leadId, propertyId } =
    parsed.data;

  if (fileDataUrl && !isAllowedDataUrl(fileDataUrl)) {
    return NextResponse.json(
      {
        error: "unsupported_file_type",
        message: "Sono ammessi solo PDF e immagini (JPG, PNG, WebP).",
      },
      { status: 400 }
    );
  }

  if (fileSize !== null && fileSize !== undefined && fileSize > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: "file_too_large",
        message: `Il file supera ${formatFileSize(MAX_FILE_BYTES)}.`,
      },
      { status: 413 }
    );
  }

  // L'immobile e il cliente devono appartenere a questa agenzia. Senza il
  // controllo, un id indovinato consentirebbe di appendere un documento al
  // fascicolo di un altro tenant — e poi di rileggerlo dall'elenco.
  const [lead, property] = await Promise.all([
    leadId
      ? prisma.lead.findFirst({ where: { id: leadId, organizationId }, select: { id: true } })
      : null,
    propertyId
      ? prisma.property.findFirst({ where: { id: propertyId, organizationId }, select: { id: true } })
      : null,
  ]);

  if (leadId && !lead) {
    return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }
  if (propertyId && !property) {
    return NextResponse.json({ error: "property_not_found" }, { status: 404 });
  }

  const acquiredAt = new Date();

  const document = await prisma.agencyDocument.create({
    data: {
      title,
      category,
      notes: notes || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      // Il termine si fissa all'acquisizione e non si ricalcola più.
      retentionUntil: computeRetentionUntil(acquiredAt),
      fileDataUrl: fileDataUrl || null,
      fileName: fileName || null,
      fileSize: fileSize ?? null,
      organizationId,
      leadId: leadId || null,
      propertyId: propertyId || null,
      uploadedById: session.user.userId ?? null,
    },
    select: { id: true, title: true, category: true, createdAt: true, retentionUntil: true },
  });

  return NextResponse.json(
    {
      document: {
        ...document,
        createdAt: document.createdAt.toISOString(),
        retentionUntil: document.retentionUntil.toISOString(),
      },
    },
    { status: 201 }
  );
}
