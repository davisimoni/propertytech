import Link from "next/link";
import { CalendarCheck, CalendarClock, CalendarX, Phone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ResyncCalendarButton } from "@/components/dashboard/resync-calendar-button";

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
      calendarSlot: {
        select: {
          agentName: true,
          // Serve al badge: distingue una visita finita sul calendario da una
          // che non ci e' mai arrivata.
          externalEventId: true,
          externalCalendarEmail: true,
        },
      },
    },
  });

  // Nessuna visita in programma: la sezione sparisce invece di mostrare un
  // riquadro vuoto. Un'agenzia che non ha ancora appuntamenti non ha bisogno
  // che glielo si ricordi ogni volta che apre la dashboard.
  if (appuntamenti.length === 0) return null;

  const nonSincronizzate = appuntamenti.filter(
    (lead) => lead.calendarSlot && !lead.calendarSlot.externalEventId
  ).length;

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
      {/* Il sottotitolo diceva "e gia' a calendario" di tutte: per quelle non
          sincronizzate era falso, ed e' proprio la frase che impediva di
          accorgersi del problema. */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Fissate dall&apos;assistente su WhatsApp.
        </p>
        {nonSincronizzate > 0 && <ResyncCalendarButton quante={nonSincronizzate} />}
      </div>

      {/* `space-y` invece di `divide-y` con righe strette.

          Le righe stavano a `py-2.5` (10px) separate da una linea: con i due
          comandi ora a 44px il testo e i pulsanti finivano quasi a contatto, e
          su telefono la riga andava a capo attaccandosi a quella sotto. Ogni
          visita e' ora un riquadro suo, con lo spazio per essere toccata
          senza centrare il vicino. */}
      <ul className="mt-3 space-y-2">
        {appuntamenti.map((lead) => (
          <li
            key={lead.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
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

              {/* Lo stato della sincronizzazione, per visita.

                  Un conteggio complessivo non basterebbe: con cinque
                  appuntamenti in elenco serve sapere QUALE non e' in agenda,
                  perche' e' quello per cui nessuno ricevera' la notifica del
                  calendario la mattina della visita. */}
              {lead.calendarSlot &&
                (lead.calendarSlot.externalEventId ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-status-qualified">
                    <CalendarCheck className="h-3 w-3" />
                    Sul calendario
                    {lead.calendarSlot.externalCalendarEmail
                      ? ` di ${lead.calendarSlot.externalCalendarEmail}`
                      : ""}
                  </p>
                ) : (
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-status-pending">
                    <CalendarX className="h-3 w-3" />
                    Non sincronizzata sul calendario
                  </p>
                ))}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* Il numero è un collegamento, non un testo: da telefono chiama,
                  ed è quello che si fa quando si è in ritardo. */}
              <a
                href={`tel:${lead.clientPhone}`}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted sm:h-8"
              >
                <Phone className="h-3.5 w-3.5" />
                Chiama
              </a>
              <Link
                href={`/leads?lead=${lead.id}`}
                className="inline-flex h-11 items-center rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted sm:h-8"
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
