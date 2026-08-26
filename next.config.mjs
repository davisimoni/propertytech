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

export default nextConfig;
