/**
 * Le 3 domande di qualificazione del Modulo 1.
 *
 * Vivono in un modulo client-safe (niente `server-only`) perché servono sia al
 * prompt dell'agente lato server sia al simulatore di chat lato client.
 */
export const QUALIFICATION_QUESTIONS = {
  mortgage:
    "Per iniziare: avete già ottenuto la delibera del mutuo dalla banca, oppure disponete di liquidità immediata?",
  sellFirst: "Per acquistare questo immobile dovete prima venderne un altro?",
  timeframe: "Entro quali tempi desiderate concludere l'acquisto?",
} as const;
