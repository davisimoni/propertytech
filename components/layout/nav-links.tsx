"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              // 44px dove si tocca: la barra compare da `md` in su, e a quella
              // larghezza c'e' anche il tablet, che si usa col dito. Restano
              // 36px dove si punta col mouse, che e' la densita' giusta per
              // un elenco di otto voci sempre a schermo.
              "group flex min-h-11 md:mouse:min-h-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-brand-gradient text-white shadow-sm"
                : "text-muted-foreground hover:translate-x-0.5 hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0 transition-colors duration-200",
                isActive ? "text-white" : "group-hover:text-primary"
              )}
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
