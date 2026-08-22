import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/seo";
import {
  MAX_REFERRAL_DISCOUNT_PERCENT,
  REFERRAL_DISCOUNT_PERCENT_PER_REFERRAL,
} from "@/lib/billing/stripe";

export interface ReferralView {
  agencyName: string;
  status: "PENDING" | "ACTIVE" | "EXPIRED";
  createdAt: string;
  activatedAt: string | null;
}

export interface ReferralStatsResponse {
  referralCode: string;
  referralLink: string;
  totalInvited: number;
  activeCount: number;
  discountPercent: number;
  maxDiscountPercent: number;
  discountPerReferral: number;
  referrals: ReferralView[];
}

/** Statistiche del Programma Referral per l'agenzia della sessione corrente. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: {
      referralCode: true,
      referralsSent: {
        select: { status: true, createdAt: true, activatedAt: true, referee: { select: { agencyName: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!organization) {
    return NextResponse.json({ error: "organization_not_found" }, { status: 404 });
  }

  const activeCount = organization.referralsSent.filter((r) => r.status === "ACTIVE").length;
  const discountPercent = Math.min(
    activeCount * REFERRAL_DISCOUNT_PERCENT_PER_REFERRAL,
    MAX_REFERRAL_DISCOUNT_PERCENT
  );

  const response: ReferralStatsResponse = {
    referralCode: organization.referralCode,
    referralLink: `${SITE_URL}/register?ref=${organization.referralCode}`,
    totalInvited: organization.referralsSent.length,
    activeCount,
    discountPercent,
    maxDiscountPercent: MAX_REFERRAL_DISCOUNT_PERCENT,
    discountPerReferral: REFERRAL_DISCOUNT_PERCENT_PER_REFERRAL,
    referrals: organization.referralsSent.map((r) => ({
      agencyName: r.referee.agencyName,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      activatedAt: r.activatedAt?.toISOString() ?? null,
    })),
  };

  return NextResponse.json(response);
}
