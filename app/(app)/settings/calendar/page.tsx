import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SlotManager } from "@/components/calendar/slot-manager";
import { ExternalCalendarSync } from "@/components/calendar/external-calendar-sync";

export default function CalendarSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Impostazioni &amp; Piano
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-foreground">Agende &amp; Disponibilità</h1>
        <p className="text-sm text-muted-foreground">
          Inserisci gli slot di disponibilità dei tuoi agenti per le visite. Gli slot liberi vengono
          proposti automaticamente dall&apos;assistente WhatsApp ai lead qualificati.
        </p>
      </div>

      {/* Sopra le disponibilità manuali: chi arriva qui per collegare
          l'agenda non deve scorrere oltre il modulo degli slot per trovarla.
          `Suspense` perché legge `?calendar=` per mostrare l'esito del
          ritorno da OAuth. */}
      <Suspense>
        <ExternalCalendarSync />
      </Suspense>

      <SlotManager />
    </div>
  );
}
