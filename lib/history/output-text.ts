/**
 * Conversione del risultato di un'elaborazione in testo.
 *
 * Vive fuori dai componenti perché la usano sia l'elenco (per copiare e
 * scaricare) sia il cassetto di dettaglio: due copie della stessa funzione
 * avrebbero prodotto, prima o poi, un file scaricato diverso dal testo
 * copiato dalla stessa voce.
 */

/**
 * Appiattisce un risultato in testo leggibile.
 *
 * L'`output` di un'estrazione documentale è un oggetto strutturato, quello di
 * un report vocale è già testo: la funzione regge entrambi. Le chiavi in
 * camelCase diventano etichette leggibili, perché è testo che finisce negli
 * appunti di una persona, non in un file di log.
 */
export function flattenOutput(output: unknown, depth = 0): string {
  if (output === null || output === undefined) return "";
  if (typeof output === "string") return output;
  if (typeof output === "number" || typeof output === "boolean") return String(output);

  if (Array.isArray(output)) {
    return output
      .map((item) => flattenOutput(item, depth))
      .filter(Boolean)
      .join("\n");
  }

  if (typeof output === "object") {
    return Object.entries(output as Record<string, unknown>)
      .map(([key, value]) => {
        const rendered = flattenOutput(value, depth + 1);
        if (!rendered) return "";
        return rendered.includes("\n")
          ? `${humanizeKey(key)}:\n${rendered}`
          : `${humanizeKey(key)}: ${rendered}`;
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

/**
 * `renditaCatastale` → `Rendita catastale`.
 *
 * Maiuscola solo sulla prima parola: in italiano "Rendita Catastale" e'
 * maiuscolo di troppo, ed e' la spia tipografica che un'interfaccia e' stata
 * tradotta dall'inglese invece che scritta in italiano.
 */
export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

/** Testo completo del risultato, qualunque forma abbia. */
export function outputToText(output: unknown): string {
  return typeof output === "string" ? output : flattenOutput(output);
}

/**
 * Nome file ricavato dal titolo.
 *
 * Ritrovare "visura-via-roma.txt" fra i download è tutt'altra cosa rispetto a
 * "download(3).txt".
 */
export function fileNameFromTitle(title: string): string {
  const slug = title
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);

  return `${slug || "elaborazione"}.txt`;
}

/** Salva un testo come file, dal browser. */
export function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
