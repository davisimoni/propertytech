import { z } from "zod";

export const registerSchema = z.object({
  firstName: z.string().trim().min(2, "Inserisci il tuo nome.").max(60),
  lastName: z.string().trim().min(2, "Inserisci il tuo cognome.").max(60),
  /**
   * Facoltativo: chi si registra dal telefono fra un appuntamento e l'altro
   * deve poter entrare subito. Se manca, la dashboard lo chiede al primo
   * accesso con lo stesso banner usato per gli account Google.
   *
   * La stringa vuota è ammessa e trattata come assente; se invece un valore
   * c'è, deve essere sensato.
   */
  agencyName: z
    .string()
    .trim()
    .max(120)
    .refine((value) => value.length === 0 || value.length >= 2, {
      message: "Il nome agenzia deve avere almeno 2 caratteri.",
    })
    .optional(),
  email: z.string().trim().toLowerCase().email("Inserisci un'email valida."),
  // 72 bytes: bcrypt silently ignores anything beyond that.
  password: z.string().min(8, "La password deve avere almeno 8 caratteri.").max(72),
  // Validato anche lato server: un controllo solo nel form sarebbe aggirabile
  // chiamando l'endpoint direttamente, e l'accettazione non sarebbe provata.
  acceptedTerms: z.literal(true, {
    message:
      "Per creare l'account devi accettare Termini, Privacy e Accordo sul trattamento dei dati.",
  }),
  /**
   * Codice del Programma Referral (`?ref=` in `/register`), facoltativo.
   * Un codice non valido non blocca la registrazione: `linkReferral` lo
   * verifica e, se non trova corrispondenza, semplicemente non collega nulla.
   */
  referralCode: z.string().trim().max(20).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Inserisci un'email valida."),
  password: z.string().min(1, "Inserisci la password."),
});

export type LoginInput = z.infer<typeof loginSchema>;
