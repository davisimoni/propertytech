"use client";

import { REFERRAL_POPUP_OPEN_EVENT } from "@/lib/referrals/constants";

/**
 * Voce "Invita un'agenzia" nel footer: apre il popup del Programma Referral.
 *
 * È un `button` e non un `Link`: non porta a un'altra pagina, esegue
 * un'azione. Darle l'aspetto di un link mantenendo la semantica corretta è
 * ciò che permette a chi naviga da tastiera o con uno screen reader di sapere
 * cosa sta per succedere.
 */
export function ReferralFooterLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(REFERRAL_POPUP_OPEN_EVENT))}
      className={className}
    >
      Invita un&apos;agenzia
    </button>
  );
}
