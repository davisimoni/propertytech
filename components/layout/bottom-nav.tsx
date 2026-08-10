"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileSearch2, LayoutDashboard, MessagesSquare, Mic, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Le voci principali per l'uso sul campo. La sidebar completa resta
 * raggiungibile dal menu nell'header: qui contano pochi bersagli ampi,
 * usabili con il pollice.
 */
const BOTTOM_NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/leads", label: "Lead", icon: MessagesSquare },
  { href: "/documents", label: "Documenti", icon: FileSearch2 },
  { href: "/social", label: "Social", icon: Share2 },
  { href: "/voice-reports", label: "Report", icon: Mic },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigazione principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden print:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 px-1 py-2 transition-all duration-200",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-full max-w-[3.25rem] items-center justify-center rounded-lg transition-all duration-200",
                    isActive && "bg-brand-gradient text-white shadow-sm"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
