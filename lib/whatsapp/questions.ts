/**
 * Le domande di qualificazione del Modulo 1.
 *
 * Vivono in un modulo client-safe (niente `server-only`) perché servono sia al
 * prompt dell'agente lato server sia al simulatore di chat lato client.
 *
 * # L'ordine conta, e `searchCriteria` viene per prima
 *
 * L'apertura chiedeva il mutuo. È la domanda più utile all'agenzia e la meno
 * naturale per chi scrive: una persona che ha appena visto un annuncio si
 * aspetta di parlare della casa, non della propria banca, e sentirsi chiedere
 * come paga prima ancora di aver detto cosa cerca allontana.
 *
 * Cosa cerca e dove è anche il dato che serve prima: senza tipologia, zona e
 * budget il contatto non partecipa al matching col portafoglio, e una
 * conversazione che si interrompe a metà — succede spesso — lasciava una
 * scheda con la situazione mutuo e nient'altro su cui lavorare.
 */
export const QUALIFICATION_QUESTIONS = {
  searchCriteria:
    "Per aiutarla al meglio: che tipo di immobile sta cercando e in quale zona?",
  mortgage:
    "Ha già ottenuto la delibera del mutuo dalla banca, oppure dispone di liquidità immediata?",
  sellFirst: "Per acquistare questo immobile deve prima venderne un altro?",
  timeframe: "Entro quali tempi desidera concludere l'acquisto?",
} as const;
