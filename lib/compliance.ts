/**
 * Testi e versioni degli impegni di conformità.
 *
 * Vivono in un unico modulo perché compaiono in punti molto distanti fra loro
 * — schermate, PDF stampati, messaggi WhatsApp, pagine legali — e una copia
 * divergente in uno solo di questi punti è esattamente il tipo di incoerenza
 * che un'autorità di controllo rileva.
 */

/** Disclaimer sugli output generati dall'AI. */
export const AI_DISCLAIMER =
  "Gli output generati dall'AI costituiscono una sintesi automatizzata a supporto dell'agente immobiliare e non sostituiscono la verifica formale da parte dei professionisti preposti.";

/** Variante compatta per messaggi con vincoli di lunghezza (es. WhatsApp). */
export const AI_DISCLAIMER_SHORT =
  "Questo riepilogo è generato automaticamente a supporto dell'agente e non sostituisce la verifica dei professionisti preposti.";

/**
 * Versione dell'accordo sul trattamento dei dati accettata dall'agenzia.
 *
 * Va incrementata a ogni modifica sostanziale del testo: l'accettazione
 * registrata sul singolo account riporta la versione, così è sempre
 * ricostruibile *quale* testo è stato accettato e quando. Senza versione,
 * una revisione successiva renderebbe le accettazioni pregresse indimostrabili.
 */
export const DPA_VERSION = "1.1";

/** Data di entrata in vigore della versione corrente. */
export const DPA_EFFECTIVE_DATE = "30 agosto 2026";

/** Sintesi degli impegni, mostrata al momento dell'accettazione. */
export const DPA_SUMMARY_POINTS = [
  "I dati che carichi restano di tua esclusiva proprietà: ne sei e resti titolare del trattamento.",
  "Li trattiamo esclusivamente su tua istruzione, per erogare il servizio, mai per finalità nostre.",
  "Database e server principali sono situati nell'Unione Europea; i trasferimenti verso fornitori extra-UE avvengono solo con le garanzie previste dal GDPR.",
  "Non vengono utilizzati per addestrare modelli di intelligenza artificiale pubblici o di terzi.",
  "Puoi richiedere in qualsiasi momento l'esportazione o la cancellazione dei dati.",
] as const;
