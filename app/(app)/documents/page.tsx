"use client";

import { FileSearch2 } from "lucide-react";
import { InfoTip } from "@/components/shared/info-tip";
import { ModuleWithHistory } from "@/components/history/module-with-history";
import { DocumentExtractor } from "@/components/documents/document-extractor";

/*
 * "use client" perché l'empty state passa `icon: FileSearch2` — un
 * riferimento a componente, non un dato serializzabile — a `ModuleWithHistory`,
 * che è un Client Component: attraversare il confine server→client con una
 * funzione non è permesso. Nessuna delle due pagine faceva già lavoro
 * server-only (niente `auth()`, niente `metadata`), quindi il passaggio non
 * toglie nulla.
 */
export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-1.5 text-xl font-semibold text-foreground">
          Analisi Documenti
          <InfoTip label="Quello che a mano vuol dire leggere una visura pagina per pagina e ricopiare intestatari, foglio e particella a mano, qui è un caricamento: pochi secondi, e i campi arrivano già compilati da correggere." />
        </h1>
        <p className="text-sm text-muted-foreground">
          Carica una Visura Catastale, Planimetria, Atto di Provenienza o APE: i dati vengono estratti
          automaticamente con Claude AI.
        </p>
      </div>

      <ModuleWithHistory
        kind="DOCUMENT_EXTRACTION"
        workLabel="Analizza"
        emptyHint="Le visure e gli atti che analizzi restano qui: potrai rileggerli senza consumare un altro credito."
        emptyState={{
          icon: FileSearch2,
          title: "Nessun documento analizzato",
          description:
            "Trascina qui una visura catastale, un atto o un APE: l'AI estrae intestatari, quote di proprietà, foglio, particella, subalterno e rendita in pochi secondi, pronti da correggere e salvare.",
          primaryLabel: "Carica il tuo primo PDF",
          // Nessun "prova con un esempio" qui: non esiste un modo onesto di
          // fingere una visura o un documento d'identità senza spacciare per
          // vera un'identità inventata. Il dato di prova che si può offrire
          // senza inventare nulla esiste per Social e Report Venditori — un
          // prompt o una nota di testo — non per un documento catastale.
        }}
      >
        <DocumentExtractor />
      </ModuleWithHistory>
    </div>
  );
}
