import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Dettaglio ed eliminazione di una singola elaborazione.
 *
 * Entrambe le operazioni filtrano per `organizationId` **nella clausola where**,
 * non con un controllo dopo la lettura: interrogare per solo `id` e verificare
 * a valle significa che una dimenticanza in un ramo del codice espone il dato,
 * mentre con il filtro nella query un record di un'altra agenzia semplicemente
 * non esiste.
 *
 * # Due tabelle, un solo id
 *
 * La cronologia mostra elaborazioni che vivono in **due tabelle diverse**:
 * estrazioni documentali e contenuti social stanno in `AiGeneration`, i report
 * post-visita in `VoiceReport`. L'elenco (`/api/history`) lo sapeva già e
 * leggeva dalla sorgente giusta; questa rotta no, e interrogava solo
 * `AiGeneration`.
 *
 * Conseguenza: **ogni** report vocale aperto dal cassetto rispondeva 404, e
 * l'interfaccia diceva "non è stato possibile caricare questa elaborazione" —
 * un messaggio che fa pensare a un dato corrotto, mentre il dato era intatto e
 * veniva cercato nel posto sbagliato. La cancellazione dalla cronologia aveva
 * lo stesso difetto.
 */

/** Titolo di un report vocale, nella stessa forma che usa l'elenco. */
function voiceReportTitle(propertyRef: string, sellerName: string | null): string {
  return sellerName ? `${propertyRef} — ${sellerName}` : propertyRef;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  const { id } = await params;

  const generation = await prisma.aiGeneration.findFirst({
    where: { id, organizationId },
    select: { id: true, kind: true, title: true, output: true, createdAt: true },
  });

  if (generation) {
    return NextResponse.json({
      ...generation,
      createdAt: generation.createdAt.toISOString(),
    });
  }

  // Non è in `AiGeneration`: può essere un report post-visita.
  const report = await prisma.voiceReport.findFirst({
    where: { id, organizationId },
    select: {
      id: true,
      propertyRef: true,
      sellerName: true,
      report: true,
      createdAt: true,
    },
  });

  if (!report) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    id: report.id,
    kind: "VOICE_REPORT",
    title: voiceReportTitle(report.propertyRef, report.sellerName),
    // `report` è una colonna Json e può contenere un report generato prima
    // dell'introduzione di `agentSummary`. Si restituisce com'è: chi lo mostra
    // rende le chiavi che trova, e una chiave assente non compare. Validarlo
    // qui contro lo schema di oggi dichiarerebbe non validi report
    // perfettamente buoni, generati la settimana prima.
    output: report.report,
    createdAt: report.createdAt.toISOString(),
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  const { id } = await params;

  // `deleteMany` e non `delete`: accetta il filtro composito su organizzazione
  // e restituisce zero invece di lanciare quando il record non è dell'agenzia.
  const generation = await prisma.aiGeneration.deleteMany({
    where: { id, organizationId },
  });

  if (generation.count > 0) {
    return NextResponse.json({ deleted: true });
  }

  const report = await prisma.voiceReport.deleteMany({
    where: { id, organizationId },
  });

  if (report.count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
