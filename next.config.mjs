import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * `@react-pdf/renderer` non va impacchettato da Next.
   *
   * Nelle route handler Next applica la condizione di esportazione
   * `react-server`, che risolve `react` sulla build RSC. Gli elementi creati da
   * quel runtime hanno una firma diversa da quella che `react-reconciler` — su
   * cui @react-pdf si appoggia — si aspetta, e il rendering muore con l'errore
   * React #31 ("Objects are not valid as a React child") **anche su un
   * documento di due righe**: non è un problema dei nostri componenti né dei
   * campi nulli.
   *
   * Marcandolo esterno, a runtime viene richiesto da node_modules con le
   * condizioni normali e vede un solo React.
   */
  serverExternalPackages: ["@react-pdf/renderer"],
};

/*
 * Il wrapper di Sentry, applicato sempre ma inerte senza DSN.
 *
 * Non carica sorgenti mappate quando mancano le credenziali: senza
 * SENTRY_AUTH_TOKEN il passaggio viene saltato invece di far fallire la
 * build, che e' cio' che serve perche' un collaboratore possa compilare in
 * locale senza avere accesso al progetto Sentry.
 */
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  // Le sorgenti mappate si caricano solo con il token: senza, gli stack
  // restano minificati ma la build passa.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Nasconde le sorgenti mappate al pubblico dopo averle caricate: servono a
  // noi per leggere gli stack, non a chi ispeziona il sito.
  hideSourceMaps: true,
  // Il tunnel evita che i bloccanti pubblicitari scartino gli eventi, ed e'
  // anche cio' che tiene la chiamata sulla nostra origine europea invece che
  // su un dominio terzo.
  tunnelRoute: "/monitoring",
  disableLogger: true,
});
