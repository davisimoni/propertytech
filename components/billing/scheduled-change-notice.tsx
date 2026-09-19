import { CalendarClock } from "lucide-react";
import { ChangePlanButton } from "@/components/billing/change-plan-button";
import { bonusDisponibili } from "@/lib/bonuses";
import type { CambioProgrammato } from "@/lib/feature-access";
import { PLANS, type PlanId } from "@/lib/plans";

const DATA = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Rome",
});

/**
 * "Il tuo piano passerà a Starter il 12 ottobre."
 *
 * # Perché avvisare, visto che il cambio l'ha deciso l'agenzia
 *
 * Perché lo decide una persona, di solito il titolare, e lo vivono tutti gli
 * altri: l'agente che il 12 ottobre trova chiuso il Report di Valorizzazione
 * non sa che qualcuno ha cambiato piano un mese prima. E perché fra la scelta
 * e la scadenza passano settimane, abbastanza per dimenticarla. L'avviso dice
 * cosa cambia, quando, e cosa resta attivo fino ad allora.
 *
 * # Perché con i bonus elencati
 *
 * Perché "il piano passa a Starter" non dice niente a chi usa gli strumenti,
 * mentre "da quella data la Checklist non sarà più inclusa" sì.
 */
export function ScheduledChangeNotice({
  cambio,
  pianoAttuale,
  puoGestire,
  conBonus = false,
}: {
  cambio: CambioProgrammato;
  pianoAttuale: PlanId;
  /** Solo il titolare apre il portale: agli altri il pulsante darebbe un errore. */
  puoGestire: boolean;
  /** Sulla pagina dei bonus: elenca quelli che non saranno più inclusi. */
  conBonus?: boolean;
}) {
  const quando = DATA.format(cambio.dal);
  const nuovo = PLANS[cambio.verso].name;
  const attuale = PLANS[pianoAttuale].name;

  const mantenuti = new Set(bonusDisponibili(cambio.verso).map((bonus) => bonus.id));
  const persi = bonusDisponibili(pianoAttuale).filter((bonus) => !mantenuti.has(bonus.id));

  return (
    <section
      role="status"
      className="rounded-xl border border-status-pending/40 bg-status-pending/5 p-4 md:p-5"
    >
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-status-pending" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {cambio.motivo === "disdetta"
              ? `Il tuo abbonamento termina il ${quando}`
              : `Il tuo piano passerà a ${nuovo} il ${quando}`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {cambio.motivo === "disdetta"
              ? `Da quella data l'agenzia torna al piano ${nuovo}. Fino ad allora restano attivi limiti e funzioni del piano ${attuale}.`
              : `Fino ad allora restano attivi limiti e bonus del piano ${attuale}, già pagato.`}
          </p>

          {conBonus && persi.length > 0 && (
            <p className="mt-2 text-sm text-foreground">
              Dal {quando} non {persi.length === 1 ? "sarà più incluso" : "saranno più inclusi"}:{" "}
              <strong className="font-semibold">
                {persi.map((bonus) => bonus.name).join(", ")}
              </strong>
              .
            </p>
          )}

          {puoGestire && (
            <div className="mt-3">
              <ChangePlanButton
                label={cambio.motivo === "disdetta" ? "Riattiva o cambia piano" : "Annulla o modifica il cambio"}
                className="sm:w-auto"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
