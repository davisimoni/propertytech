"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Avvisi brevi in un angolo dello schermo.
 *
 * # Perché un contesto e non uno stato per componente
 *
 * Prima esisteva un solo avviso, scritto a mano dentro il modulo Report
 * Vocali. Replicarlo in ogni pannello avrebbe prodotto otto implementazioni
 * leggermente diverse — posizione, durata, colori — e un'interfaccia in cui il
 * feedback cambia forma a seconda della pagina insegna a non fidarsi del
 * feedback.
 *
 * # Posizione
 *
 * In basso, non in alto. L'agente preme quasi sempre un pulsante che sta sotto
 * il contenuto — salva, invia, elimina — ed è lì che sta guardando. Sopra la
 * barra di navigazione mobile (`bottom-20`), che altrimenti lo coprirebbe.
 */

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Quanto resta a schermo: il tempo di leggerlo senza restare fra i piedi. */
const TOAST_DURATION_MS = 5000;

const TONE_CLASSES: Record<ToastTone, string> = {
  success: "border-status-qualified/40 bg-card",
  error: "border-status-blocked/40 bg-card",
  info: "border-border bg-card",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    // `Date.now()` più un contatore casuale: due avvisi nello stesso
    // millisecondo — copia e salva premuti insieme — avrebbero la stessa
    // chiave e React ne renderebbe uno solo.
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {toasts.length > 0 && (
        <div
          // `pointer-events-none` sul contenitore e riattivati sulla singola
          // scheda: altrimenti la colonna invisibile intercetta i click sui
          // pulsanti che stanno sotto, proprio nella zona in cui l'agente
          // lavora.
          className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] mx-auto flex w-[calc(100%-2rem)] max-w-md flex-col gap-2 md:bottom-6 print:hidden"
        >
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      // `status` e non `alert`: un salvataggio riuscito non deve interrompere
      // uno screen reader a metà di quello che stava leggendo.
      role="status"
      className={cn(
        "pointer-events-auto flex items-start gap-2 rounded-xl border p-3 shadow-lg",
        TONE_CLASSES[toast.tone]
      )}
    >
      {toast.tone === "success" ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-status-qualified" />
      ) : toast.tone === "error" ? (
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-blocked" />
      ) : (
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-pending" />
      )}

      <p className="min-w-0 flex-1 text-sm text-foreground">{toast.message}</p>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Chiudi l'avviso"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted sm:h-8 sm:w-8"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Accesso agli avvisi.
 *
 * Fuori dal provider restituisce una funzione che non fa nulla invece di
 * lanciare: un componente riusato in un contesto senza provider deve
 * continuare a funzionare, e la mancanza di un avviso non è un guasto che
 * valga una schermata bianca.
 */
export function useToast(): ToastContextValue {
  return useContext(ToastContext) ?? { showToast: () => {} };
}
