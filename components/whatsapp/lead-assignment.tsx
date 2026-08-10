"use client";

import { useEffect, useState } from "react";
import type { UserRole } from "@prisma/client";
import { Check, Loader2, UserCog } from "lucide-react";
import type { LeadView } from "@/lib/whatsapp/view-types";

interface Member {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  isPending: boolean;
}

/** Etichetta leggibile di un collaboratore. */
function memberLabel(member: Member): string {
  const full = [member.firstName, member.lastName].filter(Boolean).join(" ");
  return full || member.email;
}

/**
 * Assegnazione del lead a un collaboratore.
 *
 * L'elenco esclude chi non ha ancora accettato l'invito: assegnare un contatto
 * a una persona che non può ancora accedere significa farlo sparire dal
 * radar di tutti.
 */
export function LeadAssignment({
  lead,
  onAssigned,
}: {
  lead: LeadView;
  onAssigned: (assignedToId: string | null, assignedToName: string | null) => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/team")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { members: Member[] } | null) => {
        if (data) setMembers(data.members.filter((member) => !member.isPending));
      })
      .catch(() => {
        // L'assegnazione è accessoria: se l'elenco non arriva, la scheda resta
        // comunque utilizzabile.
      });
  }, []);

  async function assign(value: string) {
    const assignedToId = value || null;
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/whatsapp/leads/${lead.id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Assegnazione non riuscita.");
        return;
      }

      const member = members.find((item) => item.id === assignedToId);
      onAssigned(assignedToId, member ? memberLabel(member) : null);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch {
      setError("Errore di rete durante l'assegnazione.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <UserCog className="h-3.5 w-3.5" />
        Agente che segue il contatto
      </h3>

      <div className="mt-2 flex items-center gap-2">
        <label className="sr-only" htmlFor={`assign-${lead.id}`}>
          Assegna {lead.clientName} a un collaboratore
        </label>
        <select
          id={`assign-${lead.id}`}
          value={lead.assignedToId ?? ""}
          disabled={isSaving}
          onChange={(event) => assign(event.target.value)}
          className="input-field flex-1 text-sm disabled:opacity-60"
        >
          <option value="">Non assegnato</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {memberLabel(member)}
              {member.role === "OWNER" ? " — titolare" : ""}
            </option>
          ))}
        </select>

        {isSaving && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        {savedAt && !isSaving && (
          <Check className="h-4 w-4 shrink-0 text-status-qualified" aria-label="Assegnato" />
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-status-blocked">
          {error}
        </p>
      )}
    </section>
  );
}
