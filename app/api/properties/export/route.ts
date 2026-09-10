import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildPropertiesCsv, propertiesCsvFileName } from "@/lib/listings/property-export";

/** Coerente con il tetto dell'export lead e Radar. */
const MAX_ROWS = 2000;

/** Export CSV del portafoglio, per portarlo in Excel o riaprirlo con l'import. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const properties = await prisma.property.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });

  const csv = buildPropertiesCsv(properties);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${propertiesCsvFileName()}"`,
      "Cache-Control": "no-store",
    },
  });
}
