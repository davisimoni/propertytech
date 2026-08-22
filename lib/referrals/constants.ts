/**
 * Nome del cookie che porta il codice referral attraverso il flusso di
 * registrazione — incluso il redirect OAuth di Google, che non lascia
 * passare un campo di form. Modulo client-safe: lo usano sia la pagina di
 * registrazione (per scriverlo) sia le rotte server (per leggerlo).
 */
export const REFERRAL_COOKIE_NAME = "propertytech_ref";
