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
  /**
   * Apertura per chi scrive per vendere.
   *
   * A chi ha appena chiesto quanto vale la sua casa non si puo' rispondere
   * "che tipo di immobile cerca?": e' la prima frase della conversazione, e
   * gli direbbe che dall'altra parte non ha letto nessuno. Qui la prima
   * domanda e' dove sta l'immobile, che e' anche il dato senza il quale
   * l'agente non sa nemmeno se la zona la copre.
   */
  sellerLocation:
    "Volentieri. Per darle una valutazione attendibile: in che comune e in quale zona si trova l'immobile?",
  mortgage:
    "Ha già ottenuto la delibera del mutuo dalla banca, oppure dispone di liquidità immediata?",
  sellFirst: "Per acquistare questo immobile deve prima venderne un altro?",
  timeframe: "Entro quali tempi desidera concludere l'acquisto?",
} as const;
