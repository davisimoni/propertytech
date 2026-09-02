import "server-only";
import { prisma } from "@/lib/prisma";
import { PLANS, canBuyExtraSeats, maxSeatsFor, type Plan, type PlanId } from "@/lib/plans";

/**
 * Contabilità delle postazioni di un'agenzia.
 *
 * # Perché un modulo e non due righe dentro la rotta
 *
 * Perché lo stesso conto serve in tre punti che devono per forza dire la
 * stessa cosa: il gate che rifiuta l'invito, il pannello che mostra "2 di 3
 * occupate" e la rotta che vende una postazione in più. Tre copie divergono
 * al primo ritocco, e la forma che quella divergenza prende è la peggiore
 * possibile — un'interfaccia che dice "hai ancora una postazione" sopra un
 * pulsante che risponde che il limite è raggiunto.
 */

export interface SeatAccounting {
  plan: Plan;
  /** Postazioni incluse nel piano. `null` = illimitate. */
  planSeats: number | null;
  /** Postazioni acquistate oltre il piano. */
  extraSeats: number;
  /** Totale disponibile: piano + acquistate. `null` = illimitate. */
  maxSeats: number | null;
  /**
   * Postazioni occupate.
   *
   * Gli inviti non ancora accettati **contano**. Escluderli renderebbe il
   * limite aggirabile generando dieci inviti di fila: al momento
   * dell'accettazione sarebbero già dentro, e il controllo arriverebbe
   * quando non c'è più niente da controllare.
   */
  usedSeats: number;
  /** Quante se ne possono ancora assegnare. `null` = illimitate. */
  availableSeats: number | null;
  /** Vero se un altro invito supererebbe il limite. */
  isFull: boolean;
  /** Vero se su questo piano si possono comprare postazioni in più. */
  canBuyMore: boolean;
}

export async function getSeatAccounting(organizationId: string): Promise<SeatAccounting> {
  const [organization, usedSeats] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { extraSeats: true, subscription: { select: { status: true } } },
    }),
    prisma.user.count({ where: { organizationId } }),
  ]);

  const planId = (organization?.subscription?.status ?? "trial") as PlanId;
  const plan = PLANS[planId];
  const extraSeats = organization?.extraSeats ?? 0;
  const maxSeats = maxSeatsFor(plan, extraSeats);

  return {
    plan,
    planSeats: plan.seatsLimit,
    extraSeats,
    maxSeats,
    usedSeats,
    availableSeats: maxSeats === null ? null : Math.max(0, maxSeats - usedSeats),
    isFull: maxSeats !== null && usedSeats >= maxSeats,
    canBuyMore: canBuyExtraSeats(planId),
  };
}

/**
 * Il messaggio che il titolare legge quando le postazioni sono finite.
 *
 * Dice cosa è successo e quali sono le due strade, in quest'ordine: comprare
 * una postazione è la risposta più economica e la più frequente, cambiare
 * piano serve a chi ne vuole molte. Un messaggio che offre solo l'aggiornamento
 * di piano fa pagare a un'agenzia di quattro persone il salto all'Enterprise
 * per una persona sola.
 */
export const SEATS_LIMIT_MESSAGE =
  "Hai raggiunto il limite di postazioni del tuo piano. Aggiorna il piano o aggiungi un nuovo Seat per invitare altri agenti.";
