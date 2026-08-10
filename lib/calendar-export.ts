/**
 * Esportazione di un appuntamento verso i calendari dell'agente.
 *
 * Client-safe: il file .ics è generato nel browser e scaricato senza passare
 * dal server, perché contiene solo dati già presenti nella pagina.
 */

export interface AppointmentDetails {
  clientName: string;
  clientPhone: string;
  propertyRef: string;
  agentName?: string | null;
  start: Date;
  end: Date;
}

/** Durata assunta quando l'orario di fine non è noto. */
const DEFAULT_DURATION_MINUTES = 60;

export function resolveEnd(start: Date, end?: Date | null): Date {
  if (end && end.getTime() > start.getTime()) return end;
  return new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60_000);
}

/** Formato UTC richiesto da iCalendar: 20260804T133000Z */
function toICalUtc(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/** Formato dei deep link Google Calendar: identico all'iCalendar. */
function toGoogleUtc(date: Date): string {
  return toICalUtc(date);
}

/**
 * Applica il folding a 75 ottetti richiesto da RFC 5545.
 *
 * Senza, una descrizione lunga produce righe fuori specifica che alcuni
 * client — Outlook in particolare — rifiutano silenziosamente.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;

  const chunks: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);

  while (rest.length > 74) {
    chunks.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest.length > 0) chunks.push(` ${rest}`);

  return chunks.join("\r\n");
}

/** Escape dei caratteri speciali iCalendar: virgola, punto e virgola, backslash, a capo. */
function escapeICalText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function buildSummary(appointment: AppointmentDetails): string {
  return `Visita ${appointment.propertyRef} — ${appointment.clientName}`;
}

function buildDescription(appointment: AppointmentDetails): string {
  const lines = [
    `Cliente: ${appointment.clientName}`,
    `Telefono: ${appointment.clientPhone}`,
    `Immobile: ${appointment.propertyRef}`,
  ];
  if (appointment.agentName) lines.push(`Agente: ${appointment.agentName}`);
  return lines.join("\n");
}

/** Contenuto di un file .ics con un singolo evento. */
export function buildICalendar(appointment: AppointmentDetails): string {
  const end = resolveEnd(appointment.start, appointment.end);

  // UID stabile: reimportare lo stesso appuntamento aggiorna l'evento
  // esistente invece di crearne un duplicato.
  const uid = `visita-${appointment.start.getTime()}-${appointment.clientPhone.replace(/\D/g, "")}@propertytech`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PropertyTech//Appuntamenti//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toICalUtc(new Date())}`,
    `DTSTART:${toICalUtc(appointment.start)}`,
    `DTEND:${toICalUtc(end)}`,
    `SUMMARY:${escapeICalText(buildSummary(appointment))}`,
    `DESCRIPTION:${escapeICalText(buildDescription(appointment))}`,
    `LOCATION:${escapeICalText(appointment.propertyRef)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Promemoria visita",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // RFC 5545 impone CRLF come terminatore di riga.
  return lines.map(foldLine).join("\r\n");
}

/** Deep link a Google Calendar con l'evento precompilato. */
export function buildGoogleCalendarUrl(appointment: AppointmentDetails): string {
  const end = resolveEnd(appointment.start, appointment.end);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: buildSummary(appointment),
    dates: `${toGoogleUtc(appointment.start)}/${toGoogleUtc(end)}`,
    details: buildDescription(appointment),
    location: appointment.propertyRef,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Nome file suggerito per il download. */
export function icsFileName(appointment: AppointmentDetails): string {
  const day = appointment.start.toISOString().slice(0, 10);
  const slug = appointment.clientName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `visita-${slug || "cliente"}-${day}.ics`;
}
