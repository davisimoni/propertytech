/**
 * Comandi che l'agente scrive dentro la chat WhatsApp con il cliente.
 *
 * Servono a prendere in carico una conversazione senza aprire il gestionale:
 * l'agente vede la notifica sul telefono, entra nella chat e scrive `!pausa`.
 * È il gesto più veloce possibile, ed è quello che serve quando un cliente
 * sta scrivendo in quel momento.
 *
 * # Perché il riconoscimento è rigido
 *
 * Come per le risposte ai promemoria, la decisione **non passa dal modello**.
 * Mettere in pausa l'assistente è un'azione con conseguenze silenziose: se un
 * `!pausa` non viene riconosciuto l'AI continua a rispondere sopra l'agente;
 * se viene riconosciuto per sbaglio in una frase del cliente, l'assistente
 * smette di lavorare e nessuno se ne accorge finché il lead non si raffredda.
 * Il prefisso `!` rende la cosa inequivocabile e non collide con niente che
 * una persona scriva spontaneamente.
 */

export type AgentCommand = "pause_ai" | "resume_ai" | "reset" | "help";

/** Comando → sinonimi accettati, tutti col prefisso `!`. */
const COMMANDS: Record<AgentCommand, string[]> = {
  pause_ai: ["stop-ai", "stopai", "pausa", "pausa-ai", "umano", "prendo-io"],
  resume_ai: ["start-ai", "startai", "riprendi", "riprendi-ai", "ai"],
  /**
   * Azzeramento della conversazione.
   *
   * Nessun sinonimo breve e nessun alias generico: e' l'unico comando che
   * cancella dati, e un alias in piu' e' un modo in piu' di attivarlo per
   * sbaglio. "azzera" e "reset" bastano, e nessuno dei due si scrive per caso.
   */
  reset: ["reset", "azzera"],
  help: ["comandi", "help", "aiuto"],
};

/**
 * Riconosce un comando dell'agente, o `null` se il messaggio non lo è.
 *
 * Solo messaggi **brevi**: `!pausa` è un comando, una frase che contiene
 * `!pausa` in mezzo ad altro è un messaggio al cliente e va lasciata passare
 * intatta. La soglia evita che un testo scritto di fretta venga interpretato.
 */
export function parseAgentCommand(text: string): AgentCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("!")) return null;

  // Una parola sola dopo il `!`: niente comandi annegati in una frase.
  const word = trimmed.slice(1).trim().toLowerCase();
  if (!word || /\s/.test(word)) return null;

  const normalized = word.normalize("NFD").replace(/[^\p{L}\p{N}-]/gu, "");

  for (const [command, aliases] of Object.entries(COMMANDS)) {
    if (aliases.includes(normalized)) return command as AgentCommand;
  }

  return null;
}

/**
 * Risposta di conferma, inviata nella stessa chat.
 *
 * In forma "tu": qui il destinatario è l'agente, non il cliente finale
 * (CLAUDE.md §1). Il cliente vedrà comunque questi messaggi nella chat, quindi
 * sono scritti per essere innocui da leggere: nessun dato, nessun gergo.
 */
export const AGENT_COMMAND_REPLIES: Record<AgentCommand, string> = {
  pause_ai:
    "🔕 Assistente in pausa su questa conversazione. Da ora rispondi tu: scrivi !riprendi per riattivarlo.",
  resume_ai:
    "🔔 Assistente riattivato su questa conversazione: torna a rispondere lui dal prossimo messaggio del cliente.",
  reset:
    "🧹 Conversazione azzerata. La scheda e la cronologia di questo contatto sono state eliminate: il prossimo messaggio riparte da zero.",
  help: "Comandi disponibili: !pausa per rispondere tu, !riprendi per riattivare l'assistente, !reset per azzerare questa conversazione.",
};
