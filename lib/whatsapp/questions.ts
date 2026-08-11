/**
 * Le 3 domande di qualificazione del Modulo 1.
 *
 * Vivono in un modulo client-safe (niente `server-only`) perché servono sia al
 * prompt dell'agente lato server sia al simulatore di chat lato client.
 */
export const QUALIFICATION_QUESTIONS = {
  mortgage:
    "Per iniziare: ha già ottenuto la delibera del mutuo dalla banca, oppure dispone di liquidità immediata?",
  sellFirst: "Per acquistare questo immobile deve prima venderne un altro?",
  timeframe: "Entro quali tempi desidera concludere l'acquisto?",
} as const;
