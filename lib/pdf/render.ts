import "server-only";
import type { ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import type { PdfBranding } from "./document-pdf";

/**
 * Intestazione white-label dell'agenzia.
 *
 * Se il logo non è stato caricato il PDF ripiega sul nome dell'agenzia in
 * testo: meglio un'intestazione sobria che un documento senza mittente.
 */
export async function getPdfBranding(organizationId: string): Promise<PdfBranding> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { agencyName: true, legalName: true, logoDataUrl: true },
  });

  return {
    agencyName: organization?.agencyName ?? "Agenzia",
    legalName: organization?.legalName ?? null,
    logoDataUrl: organization?.logoDataUrl ?? null,
  };
}

/** Nome file sicuro: niente separatori di percorso né caratteri di controllo. */
export function safePdfFileName(base: string): string {
  const slug = base
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  return `${slug || "documento"}.pdf`;
}

/** Rende il documento in un buffer PDF pronto per la risposta HTTP. */
export async function renderPdf(document: ReactElement): Promise<Buffer> {
  // Il cast è necessario perché i tipi di @react-pdf/renderer attendono un
  // elemento del proprio namespace, non un generico ReactElement.
  return renderToBuffer(document as Parameters<typeof renderToBuffer>[0]);
}

/** Risposta HTTP con allegato PDF. */
export function pdfResponse(buffer: Buffer, fileName: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
