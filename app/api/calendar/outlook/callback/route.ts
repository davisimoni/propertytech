import { handleCalendarCallback } from "@/lib/calendar/oauth-handlers";

/** Ritorno dal consenso OAuth. Logica in `lib/calendar/oauth-handlers.ts`. */
export async function GET(request: Request) {
  return handleCalendarCallback("outlook", request);
}
