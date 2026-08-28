"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Check, Loader2 } from "lucide-react";

interface AgencyProfile {
  address: string | null;
  publicPhone: string | null;
  officeHours: string | null;
  visitHours: string | null;
  knowledgeNotes: string | null;
}

const CAMPI: {
  key: keyof AgencyProfile;
  label: string;
  placeholder: string;
  hint?: string;
  multiline?: boolean;
}[] = [
  {
    key: "address",
    label: "Indirizzo della sede",
    placeholder: "Via Roma 12, 41058 Vignola (MO)",
  },
  {
    key: "publicPhone",
    label: "Telefono pubblico",
    placeholder: "059 123456",
    hint: "Quello che l'assistente può dare al cliente, se lo chiede.",
  },
  {
    key: "officeHours",
    label: "Orari di apertura",
    placeholder: "Lun-Ven 9:00-13:00 e 15:00-19:00, Sab 9:00-12:00",
  },
  {
    key: "visitHours",
    label: "Orari per le visite",
    placeholder: "Su appuntamento, dal lunedì al sabato",
    hint: "Solo se diversi dagli orari dell'ufficio.",
  },
  {
    key: "knowledgeNotes",
    label: "Note e domande ricorrenti",
    placeholder:
      "Zone servite: Vignola, Savignano, Marano. Non trattiamo affitti brevi. Valutazione dell'immobile gratuita.",
    hint: "Testo libero: l'assistente lo usa per rispondere a domande di servizio prima di riprendere la qualificazione.",
    multiline: true,
  },
];

/**
 * Scheda agenzia usata dall'assistente WhatsApp.
 *
 * Campi liberi e tutti facoltativi. Il pannello lo dice esplicitamente, perché
 * la reazione naturale davanti a un modulo è compilarlo comunque: e qui un
 * orario inventato pur di riempire una casella manda una persona davanti a una
 * porta chiusa.
 */
export function AgencyProfilePanel() {
  const [profile, setProfile] = useState<AgencyProfile>({
    address: null,
    publicPhone: null,
    officeHours: null,
    visitHours: null,
    knowledgeNotes: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/organization/profile");
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { profile: AgencyProfile | null };
      if (data.profile) setProfile(data.profile);
    } catch {
      setError("Non è stato possibile caricare la scheda agenzia.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/organization/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!response.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Salvataggio non riuscito. Riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <section className="flex items-center justify-center rounded-xl border border-border bg-card p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Cosa può dire l&apos;assistente ai clienti
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Quando un cliente chiede dove siete o quando siete aperti, l&apos;assistente risponde
            con questi dati e poi riprende la qualificazione. Sono tutti facoltativi: quello che
            lasci vuoto non viene inventato — l&apos;assistente dice che lo farà sapere un agente.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {CAMPI.map(({ key, label, placeholder, hint, multiline }) => (
          <div key={key}>
            <label htmlFor={`campo-${key}`} className="text-xs font-medium text-foreground">
              {label}
            </label>
            {multiline ? (
              <textarea
                id={`campo-${key}`}
                rows={4}
                value={profile[key] ?? ""}
                placeholder={placeholder}
                onChange={(event) => setProfile({ ...profile, [key]: event.target.value })}
                className="input-field mt-1 resize-y"
              />
            ) : (
              <input
                id={`campo-${key}`}
                type="text"
                value={profile[key] ?? ""}
                placeholder={placeholder}
                onChange={(event) => setProfile({ ...profile, [key]: event.target.value })}
                className="input-field mt-1"
              />
            )}
            {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={isSaving} className="btn-brand text-xs disabled:opacity-50">
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Salva scheda agenzia
        </button>
        {saved ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-status-qualified">
            <Check className="h-3.5 w-3.5" />
            Salvato
          </span>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-xs text-status-blocked">{error}</p> : null}
    </section>
  );
}
