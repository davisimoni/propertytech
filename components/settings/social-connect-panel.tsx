"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserRole } from "@prisma/client";
import { CheckCircle2, Facebook, Instagram, Loader2, Share2, Unlink } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/shared/toast-provider";
import { ToggleSwitch } from "@/components/shared/toggle-switch";
import { cn } from "@/lib/utils";

export interface SocialConnectionStatus {
  connected: boolean;
  facebookPageId: string | null;
  facebookPageName: string | null;
  instagramUsername: string | null;
  facebookAutoPublish: boolean;
  instagramAutoPublish: boolean;
  configured: boolean;
}

type Canale = "facebook" | "instagram";

/**
 * Collegamento della Pagina Facebook e del profilo Instagram dell'agenzia.
 *
 * # Due card, un solo consenso
 *
 * Facebook e Instagram vivono in due riquadri distinti perché sono due
 * pubblici diversi con due interruttori distinti — ma sotto restano LO
 * STESSO collegamento Meta: non esiste un modo di autorizzare "solo
 * Instagram" separatamente dalla Pagina Facebook a cui è agganciato. Premere
 * "Connetti" su una card avvia sempre lo stesso consenso combinato; la card
 * disconnessa lo dice esplicitamente, o l'agente si aspetterebbe un secondo
 * passaggio che non arriva mai.
 *
 * # "Pubblicazione automatica" non è un invio senza controllo
 *
 * L'interruttore per canale non fa partire nulla da solo: /social pubblica
 * solo quando l'agente preme "Pubblica", esattamente come oggi. Ciò che
 * l'interruttore decide è se QUEL clic raggiunge anche quel canale — un modo
 * di escludere Instagram (o Facebook) dagli invii futuri senza scollegare
 * l'intero account. Il controllo vero è lato server, in `publishToMeta`: uno
 * switch spento nel database blocca l'invio anche se qualcosa a monte
 * richiedesse comunque quel canale.
 */
export function SocialConnectPanel({ currentRole }: { currentRole: UserRole }) {
  const [stato, setStato] = useState<SocialConnectionStatus | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [canaleInSalvataggio, setCanaleInSalvataggio] = useState<Canale | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
   * Scollegare non cancella dati, ma non si rimedia con un secondo clic:
   * ricollegare vuol dire rifare tutto il consenso su facebook.com, scegliere
   * di nuovo la pagina e ridare i permessi. Troppo per un tasto che sta
   * accanto agli interruttori di pubblicazione, che invece si premono spesso.
   */
  const [confermaScollega, setConfermaScollega] = useState(false);
  const { showToast } = useToast();

  const isOwner = currentRole === "OWNER";

  const carica = useCallback(async () => {
    try {
      const response = await fetch("/api/social/connection");
      if (!response.ok) return;
      setStato((await response.json()) as SocialConnectionStatus);
    } catch {
      // Silenzio: il pannello resta nello stato precedente invece di
      // annunciare un guasto per una lettura non riuscita.
    }
  }, []);

  useEffect(() => {
    void carica();
  }, [carica]);

  /*
   * Esito del ritorno da Meta, letto dall'indirizzo.
   *
   * Il callback rimanda qui con `?social=`: senza questa lettura l'agente
   * tornerebbe su una pagina identica a prima, senza sapere se il consenso ha
   * funzionato. Il parametro si toglie subito dopo, o un ricaricamento
   * ripeterebbe il messaggio.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const esito = params.get("social");
    if (!esito) return;

    const messaggi: Record<string, { testo: string; tipo: "success" | "error" }> = {
      connesso: { testo: "Pagina collegata.", tipo: "success" },
      annullato: { testo: "Collegamento annullato.", tipo: "error" },
      "nessuna-pagina": {
        testo: "Nessuna Pagina Facebook trovata su quell'account.",
        tipo: "error",
      },
      errore: { testo: "Collegamento non riuscito. Riprova.", tipo: "error" },
    };

    const messaggio = messaggi[esito];
    if (messaggio) showToast(messaggio.testo, messaggio.tipo);

    params.delete("social");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);

    void carica();
  }, [carica, showToast]);

  async function collega() {
    setInCorso(true);
    setError(null);

    try {
      const response = await fetch("/api/social/meta/start");
      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Non è stato possibile avviare il collegamento.");
        return;
      }

      // Fuori dalla nostra app: il consenso lo dà su facebook.com e torna al
      // callback, che rimanda qui.
      window.location.href = body.url as string;
    } catch {
      setError("Errore di rete.");
    } finally {
      setInCorso(false);
    }
  }

  async function scollega() {
    setInCorso(true);
    setError(null);

    try {
      const response = await fetch("/api/social/connection", { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message ?? "Non è stato possibile scollegare.");
        return;
      }
      await carica();
      showToast("Account Meta scollegato.", "success");
    } catch {
      setError("Errore di rete.");
    } finally {
      setInCorso(false);
      setConfermaScollega(false);
    }
  }

  /*
   * Ottimistico, con ripristino in caso di errore.
   *
   * L'agente aspetta un effetto immediato da un interruttore — è lo stesso
   * gesto di `AiHandoverToggle` — e un'attesa di rete su un click così breve
   * si nota. Se il salvataggio fallisce si torna indietro e si spiega perché.
   */
  async function cambiaAutoPublish(canale: Canale, valore: boolean) {
    if (!stato) return;

    const precedente = stato;
    setStato({
      ...stato,
      ...(canale === "facebook"
        ? { facebookAutoPublish: valore }
        : { instagramAutoPublish: valore }),
    });
    setCanaleInSalvataggio(canale);
    setError(null);

    try {
      const response = await fetch("/api/social/connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: canale, enabled: valore }),
      });

      if (!response.ok) {
        setStato(precedente);
        const body = await response.json().catch(() => null);
        setError(body?.message ?? "Non è stato possibile salvare la modifica.");
        return;
      }

      setStato((await response.json()) as SocialConnectionStatus);
    } catch {
      setStato(precedente);
      setError("Errore di rete. La modifica non è stata salvata.");
    } finally {
      setCanaleInSalvataggio(null);
    }
  }

  const facebookConnesso = Boolean(stato?.connected);
  const instagramConnesso = Boolean(stato?.connected && stato?.instagramUsername);

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Share2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Integrazioni Social Media</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Collega Facebook e Instagram per pubblicare i post generati in /social senza copiarli a
            mano. Entrambi arrivano dallo stesso collegamento con la Pagina dell&apos;agenzia.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <CanaleCard
          icona={Facebook}
          nome="Facebook"
          connesso={facebookConnesso}
          etichettaConnessa={stato?.facebookPageName ?? null}
          avatarUrl={
            stato?.facebookPageId
              ? `https://graph.facebook.com/${stato.facebookPageId}/picture?type=square`
              : null
          }
          autoPublish={stato?.facebookAutoPublish ?? true}
          isSavingToggle={canaleInSalvataggio === "facebook"}
          onToggle={(valore) => void cambiaAutoPublish("facebook", valore)}
          noteDisconnesso="Il consenso copre insieme Facebook e Instagram."
          isOwner={isOwner}
          inCorso={inCorso}
          onConnetti={collega}
          testoConnetti="Connetti Facebook"
        />

        <CanaleCard
          icona={Instagram}
          nome="Instagram"
          connesso={instagramConnesso}
          etichettaConnessa={stato?.instagramUsername ? `@${stato.instagramUsername}` : null}
          avatarUrl={null}
          autoPublish={stato?.instagramAutoPublish ?? true}
          isSavingToggle={canaleInSalvataggio === "instagram"}
          onToggle={(valore) => void cambiaAutoPublish("instagram", valore)}
          noteDisconnesso={
            facebookConnesso
              ? "Nessun profilo Instagram Business agganciato a questa Pagina. Collegalo nel Business Manager di Meta, poi ripeti qui."
              : "Si collega tramite la Pagina Facebook: se un profilo Instagram Business vi è agganciato, viene trovato in automatico."
          }
          isOwner={isOwner}
          inCorso={inCorso}
          onConnetti={collega}
          testoConnetti="Connetti Instagram"
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-status-blocked">
          {error}
        </p>
      )}

      {!isOwner && (
        <p className="mt-4 text-xs text-muted-foreground">
          Il collegamento lo gestisce il titolare dell&apos;agenzia.
        </p>
      )}

      {/* Dichiarato prima, non scoperto dopo: sono i due vincoli che
          sorprendono chiunque colleghi per la prima volta. */}
      <ul className="mt-4 space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
        <li>
          Serve una <strong className="font-medium text-foreground">Pagina Facebook</strong> (non un
          profilo personale) e, per Instagram, un account{" "}
          <strong className="font-medium text-foreground">Business</strong> collegato a quella
          Pagina.
        </li>
        <li>
          Su Instagram <strong className="font-medium text-foreground">non si pubblica solo
          testo</strong>: l&apos;API richiede un&apos;immagine. È un limite di Meta, non nostro.
        </li>
      </ul>

      {isOwner && facebookConnesso && (
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setConfermaScollega(true)}
            disabled={inCorso}
            className="inline-flex h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-status-blocked disabled:opacity-50 sm:h-auto"
          >
            {inCorso ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Unlink className="h-3.5 w-3.5" />
            )}
            Scollega Account Meta
          </button>
        </div>
      )}

      {confermaScollega && (
        <ConfirmDialog
          title="Scollegare l'account Meta?"
          description="La pubblicazione su Facebook e Instagram si ferma subito. Per ricollegarlo dovrai rifare il consenso su facebook.com e riselezionare la pagina: non basta premere di nuovo."
          confirmLabel="Scollega"
          isWorking={inCorso}
          onConfirm={() => void scollega()}
          onCancel={() => setConfermaScollega(false)}
        />
      )}
    </section>
  );
}

function CanaleCard({
  icona: Icona,
  nome,
  connesso,
  etichettaConnessa,
  avatarUrl,
  autoPublish,
  isSavingToggle,
  onToggle,
  noteDisconnesso,
  isOwner,
  inCorso,
  onConnetti,
  testoConnetti,
}: {
  icona: typeof Facebook;
  nome: string;
  connesso: boolean;
  etichettaConnessa: string | null;
  avatarUrl: string | null;
  autoPublish: boolean;
  isSavingToggle: boolean;
  onToggle: (valore: boolean) => void;
  noteDisconnesso: string;
  isOwner: boolean;
  inCorso: boolean;
  onConnetti: () => void;
  testoConnetti: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3",
        connesso ? "border-status-qualified/30 bg-status-qualified/5" : "border-border bg-muted/30"
      )}
    >
      <div className="flex items-center gap-2">
        <Icona className="h-4 w-4 shrink-0 text-foreground" />
        <span className="text-sm font-semibold text-foreground">{nome}</span>
      </div>

      {connesso ? (
        <>
          <div className="flex items-center gap-2">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full border border-border object-cover"
                onError={(e) => {
                  // La Pagina è pubblica e la foto quasi sempre risponde, ma
                  // un handle raro o rinominato non deve lasciare un'icona
                  // rotta al posto dell'avatar.
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{etichettaConnessa}</p>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-status-qualified">
                <CheckCircle2 className="h-3 w-3" />
                Connesso
              </span>
            </div>
          </div>

          <div className="mt-1 flex items-center justify-between gap-2 border-t border-border/70 pt-3">
            <span className="text-xs font-medium text-foreground">Pubblicazione automatica</span>
            {isOwner ? (
              <ToggleSwitch
                checked={autoPublish}
                onChange={onToggle}
                isSaving={isSavingToggle}
                label={`Pubblicazione automatica su ${nome}`}
              />
            ) : (
              <span className="text-xs text-muted-foreground">{autoPublish ? "Attiva" : "Disattiva"}</span>
            )}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {autoPublish
              ? `Quando premi "Pubblica" in /social, il post raggiunge anche ${nome}.`
              : `${nome} resta escluso quando premi "Pubblica" in /social, finché non riattivi qui.`}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Non connesso</p>
          {isOwner ? (
            <button
              type="button"
              onClick={onConnetti}
              disabled={inCorso}
              className="btn-brand text-xs disabled:opacity-50"
            >
              {inCorso ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icona className="h-4 w-4" />
              )}
              {testoConnetti}
            </button>
          ) : null}
          <p className="text-[11px] leading-snug text-muted-foreground">{noteDisconnesso}</p>
        </>
      )}
    </div>
  );
}
