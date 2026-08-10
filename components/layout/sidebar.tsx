import { Logo } from "@/components/brand/logo";
import { NavLinks } from "@/components/layout/nav-links";
import { UsageWidget } from "@/components/billing/usage-widget";

export function Sidebar() {
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-card md:flex print:hidden">
      <div className="flex h-16 items-center border-b border-border px-5">
        <Logo size="sm" gradientId="pt-sidebar" />
      </div>
      <NavLinks />
      <div className="border-t border-border p-3">
        <UsageWidget variant="full" />
      </div>
    </aside>
  );
}
