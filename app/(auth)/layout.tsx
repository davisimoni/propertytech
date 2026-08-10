import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Alone di brand: accenna al gradiente del logo senza rubare leggibilità
          al form. `pointer-events-none` evita che intercetti i click. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-brand-gradient opacity-[0.07] blur-3xl"
      />

      <div className="relative w-full max-w-sm">
        <Logo size="lg" stacked withTagline className="mb-8" gradientId="pt-auth" />
        {children}
      </div>
    </div>
  );
}
