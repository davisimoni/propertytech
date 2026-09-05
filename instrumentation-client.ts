import * as Sentry from "@sentry/nextjs";
import { sentryBaseOptions } from "@/lib/observability/sentry-options";

/**
 * Errori del browser.
 *
 * Senza DSN configurato `enabled` e' falso e questa init non spedisce nulla:
 * l'agente non vede alcuna differenza, e il costo a runtime resta quello di
 * un oggetto di configurazione.
 */
Sentry.init(sentryBaseOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
