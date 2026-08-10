import { NextResponse } from "next/server";
import type { Prisma, SellerCategory } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildLeadsCsv, csvFileName } from "@/lib/leads/export";

/** Tetto all'export: un file più grande di così non si apre comodamente in Excel. */
const MAX_ROWS = 5000;

const VALID_CATEGORIES: SellerCategory[] = ["BUYER_ONLY", "SINGLE_SELLER", "MULTI_OWNER"];

function isValidCategory(value: string): value is SellerCategory {
  return (VALID_CATEGORIES as string[]).includes(value);
}

/**
 * Interpreta una data del filtro (formato `YYYY-MM-DD` dagli input HTML).
 * `endOfDay` porta l'estremo superiore a fine giornata: un filtro "fino al 4
 * agosto" che escludesse il 4 agosto sarebbe sbagliato per chi lo imposta.
 */
function parseDate(raw: string | null, endOfDay = false): Date | null {
  if (!raw) return null;

  const date = new Date(endOfDay ? `${raw}T23:59:59.999` : `${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Export CSV dei lead, filtrabile per intervallo di date e categoria venditore. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const from = parseDate(params.get("from"));
  const to = parseDate(params.get("to"), true);
  const category = params.get("category");
  const status = params.get("status");

  // organizationId è sempre nel filtro: l'export non può diventare la via per
  // sfilare i lead di un'altra agenzia (CLAUDE.md §5).
  const where: Prisma.LeadWhereInput = { organizationId: session.user.organizationId };

  if (from || to) {
    where.createdAt = { ...(from && { gte: from }), ...(to && { lte: to }) };
  }

  if (category && isValidCategory(category)) {
    where.sellerCategory = category;
  }

  if (status === "QUALIFIED") {
    where.qualificationStatus = "QUALIFIED";
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });

  const csv = buildLeadsCsv(leads);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFileName()}"`,
      // Un export scaricato non deve finire in cache condivise.
      "Cache-Control": "no-store",
    },
  });
}
