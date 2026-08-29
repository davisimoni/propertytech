import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Password dimenticata",
  // Fuori dagli indici: è una pagina di servizio, e comparire nei risultati di
  // ricerca per "recupero password" attira solo tentativi automatici.
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
