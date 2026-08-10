"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { NavLinks } from "@/components/layout/nav-links";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Apri menu di navigazione"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
      >
        <Menu className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu di navigazione"
            className="relative flex w-72 max-w-[80vw] flex-col bg-card"
          >
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <Logo size="sm" gradientId="pt-mobile" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Chiudi menu di navigazione"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
