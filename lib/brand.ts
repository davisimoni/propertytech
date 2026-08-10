/** Identità di brand PropertyTech, unica fonte di verità per nome e payoff. */
export const BRAND = {
  name: "PropertyTech",
  /** Le due metà del wordmark, con trattamento tipografico distinto. */
  nameParts: { primary: "Property", accent: "Tech" },
  tagline: "Soluzioni AI per agenzie immobiliari",
  /**
   * Recapito pubblico unico: footer, pagine legali, informativa privacy.
   *
   * Vive qui e non nelle pagine legali perché anche il footer lo usa, e
   * `legal-page.tsx` importa già il footer: la dipendenza inversa creerebbe un
   * ciclo fra i due moduli.
   */
  email: "info@propertytechsolutions.net",
  /**
   * Casella dedicata alle richieste di assistenza, distinta da quella
   * generale: separare i due flussi evita che una segnalazione di un cliente
   * finisca in mezzo alle richieste commerciali.
   */
  supportEmail: "supporto@propertytechsolutions.net",
  /**
   * Numero WhatsApp dell'assistenza, in formato internazionale senza segni
   * (es. "393331234567").
   *
   * Vuoto finché non c'è un numero vero: il widget mostra allora la casella di
   * assistenza. Un pulsante "Scrivici su WhatsApp" che apre una chat con un
   * numero inesistente perde il contatto invece di raccoglierlo.
   */
  supportWhatsApp: "393314472241",
  /**
   * Partita IVA, pubblicata nel footer.
   *
   * Non è un dettaglio estetico: l'art. 35 del DPR 633/72 impone di indicarla
   * sul sito a chi esercita attività d'impresa online. Vive qui accanto agli
   * altri dati identificativi così ce n'è una copia sola.
   */
  vatNumber: "04259570366",
  colors: {
    navy: "#031735",
    blue: "#0066FF",
    cyan: "#00C8FF",
  },
} as const;
