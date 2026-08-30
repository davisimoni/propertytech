import Link from "next/link";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { Logo } from "@/components/brand/logo";

/**
 * Navbar pubblica. Un utente già autenticato non viene rediretto a forza:
 * la landing resta consultabile e la CTA diventa un collegamento alla dashboard.
 */
export function PublicNavbar({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="PropertyTech, torna alla home">
          <Logo size="sm" gradientId="pt-nav" />
        </Link>

        {isLoggedIn ? (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110"
          >
            <LayoutDashboard className="h-4 w-4" />
            Vai alla Dashboard
          </Link>
        ) : (
          <nav className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-all duration-200 hover:bg-muted"
            >
              Accedi
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110"
            >
              Inizia Gratis
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
