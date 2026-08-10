import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { hashInviteToken, inviteState, INVITE_STATE_MESSAGES } from "@/lib/team/invitations";
import { AcceptInviteForm } from "./accept-invite-form";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Accetta l'invito — ${BRAND.name}`,
  // Un link di invito non deve finire nei motori di ricerca.
  robots: { index: false, follow: false },
};

/** Il token è nell'URL: la pagina non può essere prerenderizzata. */
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invited = await prisma.user.findUnique({
    where: { inviteTokenHash: hashInviteToken(token) },
    select: {
      email: true,
      inviteExpiresAt: true,
      acceptedAt: true,
      organization: { select: { agencyName: true } },
    },
  });

  const state = inviteState(invited);

  if (!invited || state !== "valid") {
    // `invited` nullo implica già "not_found": lo si esplicita perché il
    // compilatore non lo deduce dalla firma di `inviteState`.
    const reason = state === "valid" ? "not_found" : state;

    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-status-pending/10 text-status-pending">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-foreground">Invito non utilizzabile</h1>
          <p className="mt-2 text-sm text-muted-foreground">{INVITE_STATE_MESSAGES[reason]}</p>
          <Link href="/login" className="btn-outline mt-5">
            Vai all&apos;accesso
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AcceptInviteForm
      token={token}
      email={invited.email}
      agencyName={invited.organization.agencyName}
    />
  );
}
