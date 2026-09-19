"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { CheckCircle2, Info } from "lucide-react";

/**
 * Esito del ritorno da Stripe: dal Checkout o dal Portale Clienti.
 *
 * Al ritorno forza un refresh della sessione: il piano lo cambia il webhook
 * lato server, quindi il JWT del browser porta ancora quello vecchio e
 * l'intestazione mostrerebbe il piano precedente fino al logout. Limiti, bonus
 * e pulsanti di cambio piano non dipendono da questo: leggono il piano dal
 * database.
 *
 * # Perché due aggiornamenti
 *
 * Perché il webhook e il ritorno della persona sulla pagina corrono in
 * parallelo, e spesso la persona arriva prima: il primo aggiornamento può
 * trovare ancora il piano di prima. Il secondo, qualche secondo dopo, trova
 * quello nuovo.
 */
const SECONDO_AGGIORNAMENTO_MS = 5_000;

export function CheckoutOutcomeBanner() {
  const params = useSearchParams();
  const outcome = params.get("checkout");
  const dalPortale = params.get("portale") === "ritorno";
  const { update } = useSession();
  const router = useRouter();

  const daAggiornare = outcome === "success" || dalPortale;

  useEffect(() => {
    if (!daAggiornare) return;
    update();
    const timer = setTimeout(async () => {
      await update();
      // La pagina e' renderizzata sul server con il piano letto al caricamento:
      // senza questo il piano evidenziato resterebbe quello di prima.
      router.refresh();
    }, SECONDO_AGGIORNAMENTO_MS);
    return () => clearTimeout(timer);
  }, [daAggiornare, update, router]);

  if (dalPortale) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Se hai cambiato piano, la modifica compare qui entro pochi secondi. Il passaggio a un
          piano superiore vale da subito; quello a un piano inferiore parte alla scadenza del
          periodo già pagato, e fino ad allora limiti e bonus restano quelli attuali.
        </p>
      </div>
    );
  }

  if (outcome !== "success" && outcome !== "cancelled") return null;

  if (outcome === "cancelled") {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Pagamento annullato. Nessun addebito è stato effettuato e il tuo piano non è cambiato.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-status-qualified/30 bg-status-qualified/10 p-4">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-qualified" />
      <div>
        <p className="text-sm font-medium text-foreground">Pagamento completato</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Il nuovo piano viene attivato entro pochi secondi dalla conferma di Stripe. Se i crediti
          non risultano aggiornati, ricarica la pagina.
        </p>
      </div>
    </div>
  );
}
