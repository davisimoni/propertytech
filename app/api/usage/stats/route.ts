import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUsageStats } from "@/lib/usage";

export async function GET() {
  const session = await auth();

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stats = await getUsageStats(session.user.organizationId);
  return NextResponse.json(stats);
}
