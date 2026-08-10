import { Suspense } from "react";
import { isGoogleAuthEnabled } from "@/lib/auth-providers";
import { RegisterForm } from "./register-form";

/**
 * Reso a ogni richiesta anziché prerenderizzato: la disponibilità del provider
 * Google dipende da variabili d'ambiente del runtime. Con il prerender statico
 * il flag verrebbe congelato al momento della build, e aggiungere le
 * credenziali in seguito non farebbe comparire il pulsante senza ricostruire.
 */
export const dynamic = "force-dynamic";

/**
 * Server component: la disponibilità del provider Google è una condizione
 * d'ambiente, quindi va risolta lato server e non esposta al client come
 * variabile pubblica.
 */
export default function RegisterPage() {
  // Il form legge `?plan=` dalla query: serve un confine Suspense.
  return (
    <Suspense>
      <RegisterForm googleEnabled={isGoogleAuthEnabled()} />
    </Suspense>
  );
}
