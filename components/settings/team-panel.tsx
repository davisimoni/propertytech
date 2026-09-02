"use client";

import { useEffect, useState } from "react";
import type { UserRole } from "@prisma/client";
import {
  Check,
  Clipboard,
  Crown,
  Loader2,
  Plus,
  Trash2,
  UserPlus,
  Users,
  Send,
} from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/shared/toast-provider";
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

/**
 * Esito dell'ultimo invito spedito.
 *
 * `url` c'e' **solo** quando l'email non e' partita: il server lo restituisce
 * come ripiego perche' il token in chiaro non e' ricostruibile, e senza il
 * link quell'invito sarebbe perso.
 */
interface InviteResult {
  email: string;
  sent: boolean;
  url?: string;
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
/** Contabilità delle postazioni, come la restituisce `/api/team`. */
interface SeatsView {
  used: number;
  max: number | null;
  planSeats: number | null;
  extra: number;
  available: number | null;
  isFull: boolean;
  canBuyMore: boolean;
  extraSeatPriceEur: number;
  planName: string;
}

export function TeamPanel({ currentRole }: { currentRole: UserRole }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [seats, setSeats] = useState<SeatsView | null>(null);
  const [isBuyingSeat, setIsBuyingSeat] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  /** Collaboratore in attesa di conferma: rimuoverne uno non si annulla. */
  const [confirming, setConfirming] = useState<Member | null>(null);
  const { showToast } = useToast();

  const isOwner = currentRole === "OWNER";

  async function load() {
    const response = await fetch("/api/team");
    if (!response.ok) return;
    const data: { members: Member[]; currentUserId: string; seats?: SeatsView } =
      await response.json();
    setMembers(data.members);
    setCurrentUserId(data.currentUserId);
    setSeats(data.seats ?? null);
  }

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, []);

  /**
   * Compra una postazione in piu'.
   *
   * Manda il TOTALE desiderato, non "+1": due clic ravvicinati su un
   * incremento comprerebbero due postazioni, mentre due clic sullo stesso
   * totale sono la stessa richiesta fatta due volte, che il server riconosce
   * e non addebita di nuovo.
   */
  async function acquistaPostazione() {
    if (!seats) return;
    setIsBuyingSeat(true);
    setError(null);

    try {
      const response = await fetch("/api/team/seats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraSeats: seats.extra + 1 }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Non e' stato possibile aggiungere la postazione.");
        return;
      }

      await load();
      showToast("Postazione aggiunta. Puoi invitare un altro collaboratore.", "success");
    } catch {
      setError("Errore di rete. La postazione non e' stata aggiunta.");
    } finally {
      setIsBuyingSeat(false);
    }
  }

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

      setInvite({
        email: email.trim(),
        sent: body.emailOutcome === "sent",
        url: body.inviteUrl as string | undefined,
      });
      showToast(
        body.emailOutcome === "sent"
          ? `Invito inviato a ${email.trim()}.`
          : "Invito creato, ma l'email non è partita: manda tu il link.",
        body.emailOutcome === "sent" ? "success" : "error"
      );
      setEmail("");
      await load();
    } catch {
      setError("Errore di rete durante l'invito.");
    } finally {
      setIsInviting(false);
    }
  }

  async function resend(member: Member) {
    setResendingId(member.id);
    setError(null);
    setInvite(null);

    try {
      const response = await fetch(`/api/team/${member.id}/resend`, { method: "POST" });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.message ?? "Invio non riuscito.");
        return;
      }

      setInvite({
        email: member.email,
        sent: body.emailOutcome === "sent",
        url: body.inviteUrl as string | undefined,
      });
      showToast(
        body.emailOutcome === "sent"
          ? `Invito rinviato a ${member.email}.`
          : "Invito rigenerato, ma l'email non è partita.",
        body.emailOutcome === "sent" ? "success" : "error"
      );
      await load();
    } catch {
      setError("Errore di rete durante l'invio.");
    } finally {
      setResendingId(null);
    }
  }

  async function remove(member: Member) {
    const id = member.id;
    setRemovingId(id);
    setError(null);

    try {
      const response = await fetch(`/api/team/${id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.message ?? "Rimozione non riuscita.");
        return;
      }

      showToast(
        member.isPending ? "Invito annullato." : "Collaboratore rimosso.",
        "success"
      );
      await load();
    } catch {
      setError("Errore di rete durante la rimozione.");
      showToast("Rimozione non riuscita.", "error");
    } finally {
      setRemovingId(null);
      setConfirming(null);
    }
  }

  async function copyLink() {
    if (!invite?.url) return;
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
            Nessuno di loro vede la fatturazione né deve inserire una carta.
          </p>
        </div>
      </div>

      {/* Le postazioni, prima dell'elenco.

          Si vedono PRIMA di provare a invitare: scoprire il limite dopo aver
          compilato un modulo e ricevuto un rifiuto e' il modo peggiore di
          comunicarlo, e fa sembrare rotto un vincolo che era solo taciuto. */}
      {seats && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {seats.used} {seats.max === null ? "postazioni occupate" : `di ${seats.max} postazioni`}
            </span>
            {seats.max === null
              ? ` · piano ${seats.planName}, postazioni personalizzate`
              : ` occupate · ${seats.planSeats} incluse nel piano ${seats.planName}${
                  seats.extra > 0 ? ` piu' ${seats.extra} acquistate` : ""
                }`}
          </p>

          {isOwner && seats.canBuyMore && (
            <button
              type="button"
              onClick={acquistaPostazione}
              disabled={isBuyingSeat}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 disabled:opacity-50 sm:h-8"
            >
              {isBuyingSeat ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Aggiungi postazione · {seats.extraSeatPriceEur}&euro;/mese
            </button>
          )}
        </div>
      )}

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

                {/*
                  Rinvio disponibile solo su un invito ancora da accettare:
                  su un collaboratore attivo rimetterebbe l'account in attesa,
                  e chi ha perso la password deve passare dal recupero.
                */}
                {isOwner && member.isPending && (
                  <button
                    type="button"
                    onClick={() => resend(member)}
                    disabled={resendingId === member.id}
                    aria-label={`Rinvia l'invito a ${member.email}`}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:text-foreground disabled:opacity-50 sm:h-8"
                  >
                    {resendingId === member.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Rinvia email
                  </button>
                )}

                {isOwner && member.id !== currentUserId && (
                  <button
                    type="button"
                    onClick={() => setConfirming(member)}
                    disabled={removingId === member.id}
                    aria-label={`${member.isPending ? "Annulla l'invito a" : "Rimuovi"} ${fullName || member.email}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all duration-200 hover:border-status-blocked/40 hover:text-status-blocked disabled:opacity-50 sm:h-8 sm:w-8"
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
        <div
          className={cn(
            "mt-4 rounded-lg border p-4",
            invite.sent
              ? "border-status-qualified/30 bg-status-qualified/10"
              : "border-status-pending/40 bg-status-pending/10"
          )}
        >
          {invite.sent ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Check className="h-4 w-4 shrink-0 text-status-qualified" />
                Invito inviato con successo a {invite.email}!
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Riceverà un&apos;email con il link per creare la password. Vale 7 giorni; se non la
                trova, controlli lo spam oppure usa &quot;Rinvia email&quot; qui sotto.
              </p>
            </>
          ) : (
            <>
              {/*
                Ripiego, non percorso normale: si arriva qui solo se il
                fornitore di posta non e' configurato o ha rifiutato. L'invito
                e' comunque valido, e senza questo link andrebbe perso — il
                token in chiaro non e' piu' ricostruibile.
              */}
              <p className="text-sm font-medium text-foreground">
                Invito creato per {invite.email}, ma l&apos;email non è partita
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Mandagli tu questo link: vale 7 giorni e{" "}
                <span className="font-medium text-foreground">non sarà più visibile</span> dopo che
                avrai lasciato questa pagina.
              </p>
              {invite.url ? (
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground">
                    {invite.url}
                  </code>
                  <button
                    type="button"
                    onClick={copyLink}
                    aria-label="Copia il link di invito"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition-all duration-200 hover:bg-muted sm:h-9 sm:w-9"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-status-qualified" />
                    ) : (
                      <Clipboard className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title={
            confirming.isPending
              ? `Annullare l'invito a ${confirming.email}?`
              : `Rimuovere ${confirming.email}?`
          }
          description={
            confirming.isPending
              ? "Il link che ha ricevuto smette di funzionare. Potrai invitarlo di nuovo in qualsiasi momento."
              : "Perde subito l'accesso ai lead, agli immobili e all'agenda dell'agenzia. I dati che ha creato restano."
          }
          confirmLabel={confirming.isPending ? "Annulla l'invito" : "Rimuovi"}
          cancelLabel="Torna indietro"
          isWorking={removingId === confirming.id}
          onConfirm={() => remove(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-status-blocked">
          {error}
        </p>
      )}
    </section>
  );
}
