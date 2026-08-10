"use client";

import { useEffect, useState } from "react";
import type { UserRole } from "@prisma/client";
import {
  Check,
  Clipboard,
  Crown,
  Loader2,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Member {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  isPending: boolean;
  inviteExpiresAt: string | null;
}

interface PendingInvite {
  email: string;
  url: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Titolare",
  AGENT: "Collaboratore",
};

/**
 * Gestione dei collaboratori dell'agenzia.
 *
 * Il link di invito viene mostrato una sola volta, subito dopo la creazione:
 * nel database resta solo l'impronta del token, quindi non è recuperabile in
 * seguito. Se il titolare lo perde, rigenera l'invito.
 */
export function TeamPanel({ currentRole }: { currentRole: UserRole }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [invite, setInvite] = useState<PendingInvite | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const isOwner = currentRole === "OWNER";

  async function load() {
    const response = await fetch("/api/team");
    if (!response.ok) return;
    const data: { members: Member[]; currentUserId: string } = await response.json();
    setMembers(data.members);
    setCurrentUserId(data.currentUserId);
  }

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, []);

  async function sendInvite() {
    setIsInviting(true);
    setError(null);
    setInvite(null);

    try {
      const response = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Invito non riuscito.");
        return;
      }

      setInvite({ email: email.trim(), url: body.inviteUrl as string });
      setEmail("");
      await load();
    } catch {
      setError("Errore di rete durante l'invito.");
    } finally {
      setIsInviting(false);
    }
  }

  async function remove(id: string) {
    setRemovingId(id);
    setError(null);

    try {
      const response = await fetch(`/api/team/${id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.message ?? "Rimozione non riuscita.");
        return;
      }

      await load();
    } catch {
      setError("Errore di rete durante la rimozione.");
    } finally {
      setRemovingId(null);
    }
  }

  async function copyLink() {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Users className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Collaboratori</h2>
          <p className="text-sm text-muted-foreground">
            Ogni agente accede con le proprie credenziali e può ricevere in carico lead e visite.
          </p>
        </div>
      </div>

      <ul className="mt-5 divide-y divide-border rounded-lg border border-border">
        {members.map((member) => {
          const fullName = [member.firstName, member.lastName].filter(Boolean).join(" ");

          return (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {fullName || member.email}
                  {member.role === "OWNER" && (
                    <Crown className="h-3.5 w-3.5 shrink-0 text-status-pending" aria-label="Titolare" />
                  )}
                  {member.id === currentUserId && (
                    <span className="text-xs font-normal text-muted-foreground">(tu)</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    member.isPending
                      ? "bg-status-pending/10 text-status-pending"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {member.isPending ? "Invito da accettare" : ROLE_LABELS[member.role]}
                </span>

                {isOwner && member.id !== currentUserId && (
                  <button
                    type="button"
                    onClick={() => remove(member.id)}
                    disabled={removingId === member.id}
                    aria-label={`Rimuovi ${fullName || member.email}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all duration-200 hover:border-status-blocked/40 hover:text-status-blocked disabled:opacity-50"
                  >
                    {removingId === member.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {isOwner ? (
        <div className="mt-4">
          <label htmlFor="invite-email" className="text-xs font-medium text-muted-foreground">
            Invita un collaboratore
          </label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="collaboratore@agenzia.it"
              className="input-field flex-1"
            />
            <button
              type="button"
              onClick={sendInvite}
              disabled={isInviting || !email.trim()}
              className="btn-brand shrink-0"
            >
              {isInviting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Genera invito
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Solo il titolare dell&apos;agenzia può invitare o rimuovere collaboratori.
        </p>
      )}

      {invite && (
        <div className="mt-4 rounded-lg border border-status-qualified/30 bg-status-qualified/10 p-4">
          <p className="text-sm font-medium text-foreground">
            Invito pronto per {invite.email}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Copia il link e mandaglielo su WhatsApp o via email. Vale 7 giorni e{" "}
            <span className="font-medium text-foreground">non sarà più visibile</span> dopo che
            avrai lasciato questa pagina.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground">
              {invite.url}
            </code>
            <button
              type="button"
              onClick={copyLink}
              aria-label="Copia il link di invito"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition-all duration-200 hover:bg-muted"
            >
              {copied ? (
                <Check className="h-4 w-4 text-status-qualified" />
              ) : (
                <Clipboard className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-status-blocked">
          {error}
        </p>
      )}
    </section>
  );
}
