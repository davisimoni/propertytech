import { handleCalendarConnect } from "@/lib/calendar/oauth-handlers";

/** Avvia il consenso OAuth verso il calendario. Logica in `lib/calendar/oauth-handlers.ts`. */
export async function GET() {
  return handleCalendarConnect("google");
}
