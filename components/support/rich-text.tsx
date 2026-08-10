import type { ReactNode } from "react";

/**
 * Formattazione minima delle risposte dell'assistente: **grassetto** ed
 * elenchi puntati.
 *
 * Costruisce **nodi React**, non HTML. Il testo arriva da un modello, e un
 * modello può essere indotto a produrre markup: passarlo a
 * `dangerouslySetInnerHTML` significherebbe trasformare una risposta di
 * assistenza in una XSS. Qui il testo resta testo per costruzione — non c'è
 * niente da sanificare perché non si interpreta nulla che non sia grassetto.
 */

/** Divide una riga sui delimitatori `**` e restituisce i pezzi già formattati. */
function inlineNodes(line: string, keyPrefix: string): ReactNode[] {
  // Split che conserva i delimitatori: gli indici dispari sono i tratti in
  // grassetto.
  const parts = line.split(/\*\*(.+?)\*\*/g);

  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <strong key={`${keyPrefix}-b${index}`} className="font-semibold">
        {part}
      </strong>
    ) : (
      part
    )
  );
}

export function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];

  let bullets: string[] = [];

  function flushBullets() {
    if (bullets.length === 0) return;

    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-1.5 list-disc space-y-0.5 pl-4">
        {bullets.map((item, index) => (
          <li key={index}>{inlineNodes(item, `li-${blocks.length}-${index}`)}</li>
        ))}
      </ul>
    );
    bullets = [];
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed);

    if (bullet) {
      bullets.push(bullet[1] ?? "");
      return;
    }

    // Una riga non-elenco chiude l'elenco in corso: senza, due elenchi
    // separati da un paragrafo finirebbero fusi in uno solo.
    flushBullets();

    if (!trimmed) return;

    blocks.push(
      <p key={`p-${index}`} className="my-1 first:mt-0 last:mb-0">
        {inlineNodes(trimmed, `p-${index}`)}
      </p>
    );
  });

  flushBullets();

  return <>{blocks}</>;
}
