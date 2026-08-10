import { isConfiguredSecret } from "@/lib/env";

/**
 * Il provider Google è opzionale: senza credenziali configurate l'app deve
 * comunque avviarsi e restare pienamente usabile con email e password.
 * Questo helper è la fonte di verità sia per la configurazione NextAuth sia
 * per la UI, così il pulsante non compare quando non porterebbe da nessuna parte.
 */
export function isGoogleAuthEnabled(): boolean {
  return (
    isConfiguredSecret(process.env.GOOGLE_CLIENT_ID) &&
    isConfiguredSecret(process.env.GOOGLE_CLIENT_SECRET)
  );
}
