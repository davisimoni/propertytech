"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Le elaborazioni AI in corso, tenute fuori dai moduli che le lanciano.
 *
 * # Il difetto che risolve
 *
 * Un'estrazione documentale o un annuncio richiedono decine di secondi, e
 * nessuno resta a guardare una barra: l'agente passa ai lead e torna. Prima,
 * cambiando pagina il componente si smontava portandosi via `status` e
 * `result`, e al ritorno la schermata era vuota come se non fosse successo
 * niente. Il risultato in realtà c'era — le rotte scrivono in `AiGeneration`
 * prima di rispondere — ma andava cercato a mano nella Cronologia, e chi non
 * lo sapeva rilanciava l'elaborazione bruciando un secondo credito.
 *
 * # Perché la promessa la possiede il provider
 *
 * È il punto centrale, non un dettaglio. Spostare solo lo *stato* non
 * basterebbe: se resta il modulo a chiamare `fetch`, allo smontaggio la
 * `then` scrive in uno stato che non esiste più e il risultato si perde
 * comunque. Qui il modulo consegna una funzione da eseguire, e a completarla
 * è il provider — che vive nel layout e non si smonta cambiando pagina.
 *
 * # Cosa NON sopravvive, dichiarato
 *
 * Un ricaricamento della pagina. Una richiesta HTTP in volo muore con il
 * documento che l'ha aperta, e nessuno stato locale può fingere il contrario:
 * mostrare uno spinner per una chiamata che non esiste più lascerebbe
 * l'agente ad aspettare un risultato che non arriva. Il lavoro sul server
 * prosegue e finisce in `AiGeneration`, quindi dopo un ricaricamento il posto
 * dove guardare è la Cronologia del modulo.
 */

export type JobKind = "documents" | "social" | "voice";
export type JobStatus = "running" | "done" | "error";

/** Dove riportare l'agente quando clicca l'indicatore. */
export const JOB_ROUTES: Record<JobKind, string> = {
  documents: "/documents",
  social: "/social",
  voice: "/voice-reports",
};

export const JOB_LABELS: Record<JobKind, string> = {
  documents: "Analisi documento",
  social: "Generazione contenuti",
  voice: "Report post-visita",
};

export interface Job {
  id: string;
  kind: JobKind;
  /** Come compare nell'indicatore: nome del file, riferimento immobile. */
  title: string;
  status: JobStatus;
  startedAt: number;
  /** Risultato grezzo del modulo, tipizzato da chi lo consuma. */
  result?: unknown;
  error?: string;
  /**
   * Il gate di piano ha risposto 402.
   *
   * Distinto da `error` perché il modulo deve aprire il modale di upgrade,
   * non mostrare una riga rossa: sono due reazioni diverse a due situazioni
   * diverse, e confonderle nasconde la strada per sbloccare la funzione.
   */
  paywall?: boolean;
  /**
   * Dettagli del 402, quando il modulo ne distingue piu' d'uno.
   *
   * I report vocali separano "crediti finiti" da "funzione non nel piano":
   * sono due messaggi diversi e due strade diverse per l'agenzia, e ridurli a
   * un booleano mostrerebbe a chi ha esaurito le note vocali un invito a
   * cambiare piano che non le serve.
   */
  paywallDetail?: { reason: "limit_reached" | "not_in_plan"; requiredPlan?: string };
}

/** Segnalato da `run` quando la rotta risponde 402. */
export class JobPaywallError extends Error {
  readonly detail?: Job["paywallDetail"];

  constructor(detail?: Job["paywallDetail"]) {
    super("payment_required");
    this.name = "JobPaywallError";
    this.detail = detail;
  }
}

interface JobContextValue {
  jobs: Job[];
  /** L'elaborazione più recente di quel modulo, in corso o conclusa. */
  jobFor: (kind: JobKind) => Job | undefined;
  /**
   * Avvia l'elaborazione e ne restituisce l'esito, o `undefined` se fallita.
   *
   * Restituirlo evita che il chiamante lo rilegga da `jobFor` subito dopo
   * l'`await`: quella e' la closure del render precedente e conterrebbe
   * ancora lo stato di prima, cioe' nessun risultato.
   */
  startJob: <T>(params: {
    kind: JobKind;
    title: string;
    run: () => Promise<T>;
  }) => Promise<T | undefined>;
  /**
   * Sostituisce l'esito di un'elaborazione conclusa.
   *
   * Serve perche' i risultati sono modificabili: su una scansione storta l'AI
   * puo' leggere male una cifra, e il numero giusto lo conosce l'agente. Senza
   * questo, una correzione fatta a mano sparirebbe cambiando pagina — cioe'
   * proprio il difetto che questo provider esiste per togliere.
   */
  updateResult: (kind: JobKind, result: unknown) => void;
  clearJob: (kind: JobKind) => void;
}

const JobContext = createContext<JobContextValue | null>(null);

export function JobProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);

  /*
   * Le elaborazioni già partite, per modulo.
   *
   * In un `ref` e non nello stato: serve a decidere *durante* una chiamata se
   * un'altra è già in volo, e lo stato di React si aggiorna troppo tardi per
   * quello. È la guardia contro il doppio invio — due clic ravvicinati su
   * "Genera" pagherebbero due crediti per lo stesso contenuto.
   */
  const inVolo = useRef<Set<JobKind>>(new Set());

  const jobFor = useCallback(
    (kind: JobKind) => jobs.find((job) => job.kind === kind),
    [jobs]
  );

  const updateResult = useCallback((kind: JobKind, result: unknown) => {
    setJobs((correnti) =>
      correnti.map((job) => (job.kind === kind ? { ...job, result } : job))
    );
  }, []);

  const clearJob = useCallback((kind: JobKind) => {
    inVolo.current.delete(kind);
    setJobs((correnti) => correnti.filter((job) => job.kind !== kind));
  }, []);

  const startJob = useCallback(
    async <T,>({
      kind,
      title,
      run,
    }: {
      kind: JobKind;
      title: string;
      run: () => Promise<T>;
    }): Promise<T | undefined> => {
      if (inVolo.current.has(kind)) return undefined;
      inVolo.current.add(kind);

      const id = `${kind}-${Date.now()}`;
      // Una sola elaborazione per modulo: la nuova sostituisce la precedente,
      // che a schermo non sarebbe comunque più visibile.
      setJobs((correnti) => [
        ...correnti.filter((job) => job.kind !== kind),
        { id, kind, title, status: "running", startedAt: Date.now() },
      ]);

      try {
        const result = await run();
        setJobs((correnti) =>
          correnti.map((job) => (job.id === id ? { ...job, status: "done", result } : job))
        );
        return result;
      } catch (error) {
        const paywall = error instanceof JobPaywallError;
        setJobs((correnti) =>
          correnti.map((job) =>
            job.id === id
              ? {
                  ...job,
                  status: "error",
                  paywall,
                  paywallDetail: paywall ? (error as JobPaywallError).detail : undefined,
                  error: paywall
                    ? undefined
                    : error instanceof Error
                      ? error.message
                      : "Elaborazione non riuscita.",
                }
              : job
          )
        );
        return undefined;
      } finally {
        inVolo.current.delete(kind);
      }
    },
    []
  );

  const value = useMemo(
    () => ({ jobs, jobFor, startJob, updateResult, clearJob }),
    [jobs, jobFor, startJob, updateResult, clearJob]
  );

  return <JobContext.Provider value={value}>{children}</JobContext.Provider>;
}

export function useJobs(): JobContextValue {
  const context = useContext(JobContext);
  if (!context) {
    throw new Error("useJobs va usato dentro <JobProvider>");
  }
  return context;
}
