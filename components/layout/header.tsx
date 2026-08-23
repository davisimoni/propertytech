"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ProfileMenu } from "@/components/layout/profile-menu";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UsageWidget } from "@/components/billing/usage-widget";

export function Header() {
  const { data: session } = useSession();
  const planId = session?.user?.planId;

  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-3 md:h-16 md:gap-4 md:px-6 print:hidden">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <MobileNav />
        <UsageWidget variant="compact" />
      </div>
      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        <ThemeToggle />
        {planId && planId !== "enterprise" && (
          // "Aggiorna piano" e non "Passa a Pro": il pulsante compare anche a
          // chi è già su Professional, a cui "Passa a Pro" non dice nulla.
          <Link
            href="/settings?tab=billing"
            className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-xl bg-brand-gradient px-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 sm:px-4"
          >
            {/* "Aggiorna" da solo sul telefono: la frase intera andava a capo
                dentro un pulsante alto 36px, sfondandolo. */}
            <span className="sm:hidden">Aggiorna</span>
            <span className="hidden sm:inline">Aggiorna piano</span>
          </Link>
        )}
        <ProfileMenu />
      </div>
    </header>
  );
}
