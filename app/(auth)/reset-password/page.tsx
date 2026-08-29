import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Reimposta la password",
  robots: { index: false, follow: false },
};

/**
 * `Suspense` obbligatorio: il form legge `?token=` con `useSearchParams`, e
 * senza confine di sospensione Next rifiuta di prerenderizzare la pagina.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
