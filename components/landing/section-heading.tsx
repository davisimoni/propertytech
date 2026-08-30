import type { ReactNode } from "react";

/**
 * Intestazione di sezione: occhiello, titolo, sottotitolo.
 *
 * # Perché un componente e non sei copie
 *
 * Le sei sezioni della landing avevano ciascuna il proprio `h2` scritto a
 * mano, con le stesse classi ricopiate. Erano già divergenti: tre mettevano
 * `mt-2` sotto l'occhiello e tre `mt-3`, differenza invisibile guardando una
 * sezione alla volta e visibile scorrendo la pagina, dove i titoli non
 * cadono alla stessa distanza dalla propria etichetta.
 *
 * È la deriva tipica del copia-incolla: nessuno la introduce di proposito,
 * nasce dal ritoccare una sezione senza sapere che le altre cinque hanno lo
 * stesso blocco. Con una definizione sola, un ritocco vale per tutte e
 * l'incoerenza non ha modo di ricomparire.
 *
 * # Le tre varianti, e perché sono proprietà e non eccezioni
 *
 * Ogni sezione che si scostava aveva una ragione reale, non un capriccio:
 * il marchio sopra i moduli, l'`id` che la sezione sicurezza referenzia da
 * `aria-labelledby`, l'allineamento a sinistra dei contatti — che stanno in
 * due colonne, dove centrare il titolo lo staccherebbe dal modulo accanto.
 * Sono qui come parametri: fuori di qui tornerebbero a essere sei blocchi
 * scritti a mano.
 */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  width = "narrow",
  align = "center",
  titleId,
  above,
}: {
  eyebrow: string;
  title: ReactNode;
  /** Accetta nodi, non solo testo: alcuni sottotitoli evidenziano un termine
   *  che il prodotto mostra davvero, e ridurlo a stringa lo perderebbe. */
  subtitle?: ReactNode;
  /** `wide` per i titoli lunghi, che a `max-w-2xl` si spezzano su troppe righe. */
  width?: "narrow" | "wide";
  align?: "center" | "left";
  /** Per le sezioni che referenziano il proprio titolo da `aria-labelledby`. */
  titleId?: string;
  /** Elemento sopra l'occhiello, es. il marchio nella sezione dei moduli. */
  above?: ReactNode;
}) {
  const centrato = align === "center";

  return (
    <div
      className={[
        centrato ? "mx-auto text-center" : "text-left",
        width === "wide" ? "max-w-3xl" : "max-w-2xl",
      ].join(" ")}
    >
      {above}
      <span
        className={[
          "block text-xs font-semibold uppercase tracking-widest text-primary",
          // Stacco dal marchio, solo dove il marchio c'è.
          above ? "mt-4" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {eyebrow}
      </span>
      {/* `text-balance`: distribuisce le righe di un titolo lungo invece di
          lasciarne una sola parola in fondo, che sul telefono è il difetto
          più visibile di un h2 di questa lunghezza. */}
      <h2
        id={titleId}
        className="mt-2 text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
      >
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
