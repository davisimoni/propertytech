import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  authorLabel,
  HISTORY_PAGE_SIZE,
  isHistoryKind,
  toPreview,
  type HistoryEntry,
  type HistoryKind,
} from "@/lib/history/entries";

/**
 * Cronologia delle elaborazioni AI dell'agenzia.
 *
 * Ogni query filtra per `organizationId` preso dalla **sessione**, mai da un
 * parametro: se l'organizzazione arrivasse dalla richiesta, cambiare un valore
 * nell'URL basterebbe a leggere la cronologia di un'altra agenzia
 * (CLAUDE.md §5).
 *
 * La paginazione è a cursore e non a offset: con `skip` crescente il database
 * rilegge e scarta le righe precedenti a ogni pagina, e una cronologia lunga
 * rallenta man mano che la si scorre. Il cursore parte sempre da dove si era
 * arrivati.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  const params = new URL(request.url).searchParams;

  const kindParam = params.get("kind");
  const kind: HistoryKind | null = isHistoryKind(kindParam) ? kindParam : null;
  const propertyId = params.get("propertyId");
  const cursor = params.get("cursor");

  /*
   * Ricerca sul contenuto, non solo su quello che la pagina ha già caricato.
   *
   * L'elenco arriva a pagine da venti: filtrare nel browser avrebbe cercato
   * dentro le prime venti voci e dichiarato "nessun risultato" su una
   * cronologia che il risultato ce l'ha alla trentesima. Qui il filtro è nel
   * `where`, quindi il cursore continua a impaginare i soli risultati.
   *
   * `mode: "insensitive"` perché nessuno cerca rispettando le maiuscole del
   * proprio archivio.
   */
  const q = (params.get("q") ?? "").trim();
  const contains = q ? { contains: q, mode: "insensitive" as const } : null;

  // I report vocali vivono su `VoiceReport`: sorgente diversa, stessa forma in
  // uscita.
  if (kind === "VOICE_REPORT") {
    const reports = await prisma.voiceReport.findMany({
      where: {
        organizationId,
        // Immobile, proprietario e testo della nota: i tre punti da cui un
        // agente riconosce un report suo.
        ...(contains
          ? {
              OR: [
                { propertyRef: contains },
                { sellerName: contains },
                { transcript: contains },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: HISTORY_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        propertyRef: true,
        sellerName: true,
        transcript: true,
        createdAt: true,
        sentToSeller: true,
      },
    });

    const page = reports.slice(0, HISTORY_PAGE_SIZE);

    const entries: HistoryEntry[] = page.map((report) => ({
      id: report.id,
      kind: "VOICE_REPORT",
      title: report.sellerName
        ? `${report.propertyRef} — ${report.sellerName}`
        : report.propertyRef,
      preview: toPreview(report.transcript),
      createdAt: report.createdAt.toISOString(),
      authorName: null,
      hasPdf: true,
      sent: report.sentToSeller,
      propertyRef: report.propertyRef,
      sellerName: report.sellerName,
    }));

    return NextResponse.json({
      entries,
      nextCursor: reports.length > HISTORY_PAGE_SIZE ? page[page.length - 1]?.id ?? null : null,
    });
  }

  const generations = await prisma.aiGeneration.findMany({
    where: {
      organizationId,
      ...(kind ? { kind } : {}),
      ...(propertyId ? { propertyId } : {}),
      // `output` non è cercabile: è JSON e non un testo. `preview` ne è
      // l'estratto già pronto, ed è quello che l'agente ha letto in elenco.
      ...(contains ? { OR: [{ title: contains }, { preview: contains }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: HISTORY_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    // `output` volutamente escluso: elencare venti elaborazioni non deve
    // trasferire venti JSON interi. Il dettaglio si carica solo all'apertura.
    select: {
      id: true,
      kind: true,
      title: true,
      preview: true,
      createdAt: true,
      createdBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  const page = generations.slice(0, HISTORY_PAGE_SIZE);

  const entries: HistoryEntry[] = page.map((generation) => ({
    id: generation.id,
    kind: generation.kind,
    title: generation.title,
    preview: generation.preview,
    createdAt: generation.createdAt.toISOString(),
    authorName: authorLabel(generation.createdBy),
    hasPdf: false,
    sent: null,
  }));

  return NextResponse.json({
    entries,
    nextCursor: generations.length > HISTORY_PAGE_SIZE ? page[page.length - 1]?.id ?? null : null,
  });
}
