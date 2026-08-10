import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { confirmPortfolioMatch, ignorePortfolioMatch } from "@/lib/leads/portfolio-sync";

const decisionSchema = z.object({
  decision: z.enum(["confirm", "ignore"]),
});

/**
 * Validazione umana di una corrispondenza visura ↔ lead.
 *
 * `confirm` fa entrare l'immobile nel portafoglio del contatto; `ignore` la
 * archivia come omonimia. In entrambi i casi la decisione è definitiva e non
 * verrà riproposta al prossimo caricamento della stessa visura.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = decisionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const organizationId = session.user.organizationId;

  if (parsed.data.decision === "ignore") {
    const ignored = await ignorePortfolioMatch(organizationId, id);
    if (!ignored) {
      return NextResponse.json({ error: "match_not_found" }, { status: 404 });
    }
    return NextResponse.json({ decision: "ignore" });
  }

  const confirmed = await confirmPortfolioMatch(organizationId, id);
  if (!confirmed) {
    return NextResponse.json({ error: "match_not_found" }, { status: 404 });
  }

  return NextResponse.json({ decision: "confirm", ...confirmed });
}
