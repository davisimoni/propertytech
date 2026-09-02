import Link from "next/link";
import { CalendarClock, Phone } from "lucide-react";
import { prisma } from "@/lib/prisma";

/**
 * Le visite già fissate, in dashboard.
 *
 * # Perché è una sezione e non una metrica
 *
 * Perché un appuntamento è una cosa da fare, non un numero da guardare.
 * L'assistente ora fissa visite da solo mentre l'agenzia è chiusa: senza
 * questa sezione, una visita concordata alle nove di sera esisteva solo dentro
 * la conversazione WhatsApp e sul calendario dell'agente — e chi apriva la
 * dashboard la mattina non aveva modo di sapere che qualcuno lo aspettava.
 *
 * # Perché solo le prossime, e non lo storico
 *
 * Perché serve a decidere la giornata. Le visite passate stanno nella scheda
 * di ciascun contatto, dove si va quando si vuole ricostruire una storia; qui
 * si guarda cosa succede adesso, e un elenco che comincia da tre mesi fa non
 * lo si legge.
 */
export async function UpcomingAppointments({ organizationId }: { organizationId: string }) {
  const adesso = new Date();

  const appuntamenti = await prisma.lead.findMany({
    where: {
      organizationId,
      appointmentSlot: { gte: adesso },
      qualificationStatus: { not: "OPT_OUT" },
    },
    orderBy: { appointmentSlot: "asc" },
    take: 5,
    select: {
      id: true,
      clientName: true,
      clientPhone: true,
      propertyRef: true,
      appointmentSlot: true,
      intent: true,
      calendarSlot: { select: { agentName: true } },
    },
  });

  // Nessuna visita in programma: la sezione sparisce invece di mostrare un
  // riquadro vuoto. Un'agenzia che non ha ancora appuntamenti non ha bisogno
  // che glielo si ricordi ogni volta che apre la dashboard.
  if (appuntamenti.length === 0) return null;

  const quando = (data: Date) =>
    new Intl.DateTimeFormat("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Rome",
    }).format(data);

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CalendarClock className="h-4 w-4 text-primary" />
        Prossime visite in programma
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Fissate dall&apos;assistente su WhatsApp e già a calendario.
      </p>

      <ul className="mt-3 divide-y divide-border">
        {appuntamenti.map((lead) => (
          <li key={lead.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {lead.clientName}
                {/* Un sopralluogo da acquisizione non è una visita d'acquisto:
                    chi legge deve sapere cosa va a fare prima di uscire. */}
                {(lead.intent === "VENDITA" || lead.intent === "ENTRAMBI") && (
                  <span className="ml-1.5 rounded-full bg-status-pending/15 px-1.5 py-0.5 text-[11px] font-semibold text-status-pending">
                    Sopralluogo
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {lead.appointmentSlot ? quando(lead.appointmentSlot) : ""}
                {lead.calendarSlot?.agentName ? ` · ${lead.calendarSlot.agentName}` : ""}
                {lead.propertyRef ? ` · ${lead.propertyRef}` : ""}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* Il numero è un collegamento, non un testo: da telefono chiama,
                  ed è quello che si fa quando si è in ritardo. */}
              <a
                href={`tel:${lead.clientPhone}`}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted sm:h-8"
              >
                <Phone className="h-3.5 w-3.5" />
                Chiama
              </a>
              <Link
                href={`/leads?lead=${lead.id}`}
                className="inline-flex h-10 items-center rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted sm:h-8"
              >
                Apri
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
