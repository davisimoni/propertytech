"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { BookOpen, Building2, ChevronDown, LogOut, ShieldCheck, User } from "lucide-react";

/**
 * Menu profilo dell'area riservata.
 *
 * Raccoglie le voci che nell'area pubblica stanno nel footer: dentro
 * l'applicazione l'agente sta lavorando, e una colonna di link commerciali
 * sotto ogni schermata sarebbe solo rumore. Qui restano le poche che gli
 * servono davvero, a un clic dall'angolo in alto a destra.
 */
export function ProfileMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const agencyName = session?.user?.agencyName ?? "La tua agenzia";
  const email = session?.user?.email ?? "";

  const itemClass =
    "flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu profilo"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border pl-1.5 pr-2 text-sm font-medium text-foreground transition-all duration-200 hover:bg-muted"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-gradient text-white">
          <User className="h-3.5 w-3.5" />
        </span>
        <span className="hidden max-w-[10rem] truncate sm:inline">{agencyName}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-medium text-foreground">{agencyName}</p>
            {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
          </div>

          <div className="py-1">
            <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              Profilo Agenzia
            </Link>

            {/* In una scheda nuova: l'agente sta lavorando su una schermata e
                consultare la guida non deve fargli perdere il punto in cui era. */}
            <a
              href="/guida"
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
              Guida e documentazione
            </a>

            <Link href="/privacy" role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
              <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
              Privacy e trattamento dati
            </Link>
          </div>

          <div className="border-t border-border py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className={`${itemClass} text-status-blocked`}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Esci
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
