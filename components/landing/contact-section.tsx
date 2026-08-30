"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2, Mail, Send, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { SectionHeading } from "@/components/landing/section-heading";

/**
 * Sezione "Contatti" della landing pubblica.
 *
 * Forma "tu": qui parla il prodotto al suo utente, come nel resto della landing
 * e della GUI. Il "lei" è riservato ai messaggi che l'agenzia manda ai propri
 * clienti finali (CLAUDE.md §1).
 */

// Casella dell'assistenza, non quella generale: chi scrive da qui ha una
// domanda sul prodotto, e la risposta deve arrivare da chi lo conosce.
const CONTACT_EMAIL = BRAND.supportEmail;

interface FieldErrors {
  [key: string]: string | undefined;
}

export function ContactSection() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");

  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function validate(): boolean {
    const errors: FieldErrors = {};

    if (firstName.trim().length < 2) errors.firstName = "Inserisci il tuo nome";
    if (lastName.trim().length < 2) errors.lastName = "Inserisci il tuo cognome";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errors.email = "Controlla l'indirizzo email";
    // Facoltativo, ma validato se compilato: un numero sbagliato è peggio di
    // un numero assente, perché fa provare a chiamare.
    if (phone.trim() && phone.trim().length < 6) errors.phone = "Inserisci un numero valido";
    if (message.trim().length < 10) errors.message = "Scrivi qualche parola in più";

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    // Validato anche qui e non solo sul server: correggere un campo senza
    // aspettare una risposta di rete è la differenza fra correggere e
    // abbandonare il modulo.
    if (!validate()) return;

    setIsSending(true);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          agencyName: agencyName.trim() || undefined,
          message: message.trim(),
          website: website || undefined,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.message ?? "Invio non riuscito. Riprova fra poco.");
        return;
      }

      setIsSent(true);
    } catch {
      setError(`Errore di rete. Puoi scriverci direttamente a ${CONTACT_EMAIL}.`);
    } finally {
      setIsSending(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/30";

  return (
    <section
      id="contatti"
      className="scroll-mt-20 border-t border-border bg-gradient-to-b from-muted/50 via-background to-muted/30 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
          {/* --- Colonna sinistra: valore e recapiti --- */}
          <div>
            {/* Allineata a sinistra: questa sezione e' in due colonne, e un
                titolo centrato si staccherebbe dal modulo che gli sta accanto. */}
            <SectionHeading
              align="left"
              eyebrow="Contatti"
              title={<>Hai domande o vuoi vedere l&apos;IA in azione sulla tua agenzia?</>}
              subtitle="Compila il modulo per qualsiasi dubbio operativo o per richiedere una breve dimostrazione. Ti rispondiamo via email entro 24 ore lavorative, o su WhatsApp se ci lasci il numero."
            />

            <ul className="mt-8 space-y-4">
              <li className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Mail className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Scrivici</p>
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="break-all text-sm text-muted-foreground transition-colors duration-200 hover:text-primary"
                  >
                    {CONTACT_EMAIL}
                  </a>
                </div>
              </li>

              <li className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-status-qualified/10 text-status-qualified">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Garanzia GDPR</p>
                  <p className="text-sm text-muted-foreground">
                    Database e server principali in Unione Europea (Francoforte), trattamento
                    conforme al GDPR
                  </p>
                </div>
              </li>

              <li className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Clock className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Supporto prioritario</p>
                  <p className="text-sm text-muted-foreground">Rispondiamo entro 24 ore</p>
                </div>
              </li>
            </ul>
          </div>

          {/* --- Colonna destra: modulo --- */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-lg sm:p-8">
            {isSent ? (
              // Sostituisce il modulo invece di affiancarlo: lasciare i campi
              // compilati sotto una conferma invita a premere di nuovo.
              <div role="status" className="py-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-status-qualified/10 text-status-qualified">
                  <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">
                  Richiesta inviata
                </h3>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                  Grazie: ti ricontattiamo entro 24 ore lavorative su WhatsApp o via email. Se nel
                  frattempo vuoi già provare la piattaforma, la prova gratuita non richiede carta di
                  credito.
                </p>
                <Link href="/register" className="btn-brand mx-auto mt-5">
                  Prova gratis
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                {/* Campo trappola: nascosto agli utenti e alle tecnologie
                    assistive, compilato dai robot. */}
                <div className="hidden" aria-hidden="true">
                  <label htmlFor="contact-website">Non compilare</label>
                  <input
                    id="contact-website"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    id="contact-firstname"
                    label="Nome"
                    required
                    error={fieldErrors.firstName}
                  >
                    <input
                      id="contact-firstname"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      placeholder="Marco"
                      autoComplete="given-name"
                      maxLength={60}
                      className={inputClass}
                      aria-invalid={Boolean(fieldErrors.firstName)}
                    />
                  </Field>

                  <Field id="contact-lastname" label="Cognome" required error={fieldErrors.lastName}>
                    <input
                      id="contact-lastname"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      placeholder="Rossi"
                      autoComplete="family-name"
                      maxLength={60}
                      className={inputClass}
                      aria-invalid={Boolean(fieldErrors.lastName)}
                    />
                  </Field>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field
                    id="contact-email"
                    label="Email aziendale"
                    required
                    error={fieldErrors.email}
                  >
                    <input
                      id="contact-email"
                      type="email"
                      inputMode="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="m.rossi@agenzia.it"
                      autoComplete="email"
                      maxLength={200}
                      className={inputClass}
                      aria-invalid={Boolean(fieldErrors.email)}
                    />
                  </Field>

                  <Field
                    id="contact-phone"
                    label="Telefono / WhatsApp"
                    optional
                    error={fieldErrors.phone}
                  >
                    <input
                      id="contact-phone"
                      type="tel"
                      inputMode="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="+39 333 1234567"
                      autoComplete="tel"
                      maxLength={30}
                      className={inputClass}
                      aria-invalid={Boolean(fieldErrors.phone)}
                    />
                  </Field>
                </div>

                <div className="mt-4">
                  <Field id="contact-agency" label="Nome dell'agenzia immobiliare" optional>
                    <input
                      id="contact-agency"
                      value={agencyName}
                      onChange={(event) => setAgencyName(event.target.value)}
                      placeholder="Es. Immobiliare Rossi / Group"
                      autoComplete="organization"
                      maxLength={120}
                      className={inputClass}
                    />
                  </Field>
                </div>

                <div className="mt-4">
                  <Field id="contact-message" label="Messaggio" required error={fieldErrors.message}>
                    <textarea
                      id="contact-message"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      placeholder="Raccontaci le tue esigenze o chiedi informazioni sui moduli IA…"
                      rows={4}
                      maxLength={2000}
                      className={cn(inputClass, "resize-y")}
                      aria-invalid={Boolean(fieldErrors.message)}
                    />
                  </Field>
                </div>

                {error && (
                  <p role="alert" className="mt-4 text-sm text-status-blocked">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSending}
                  className="btn-brand mt-5 w-full disabled:opacity-60"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Invio in corso…
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" aria-hidden="true" />
                      Invia richiesta
                    </>
                  )}
                </button>

                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Inviando il messaggio accetti la nostra{" "}
                  <Link href="/privacy" className="text-primary hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Etichetta, campo ed errore: l'errore sotto al campo, dove lo si cerca. */
function Field({
  id,
  label,
  required,
  optional,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
        {required && (
          <span className="text-status-blocked" aria-hidden="true">
            {" "}
            *
          </span>
        )}
        {optional && <span className="font-normal text-muted-foreground"> (facoltativo)</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-status-blocked">
          {error}
        </p>
      )}
    </div>
  );
}
