import { ModuleWithHistory } from "@/components/history/module-with-history";
import { DocumentExtractor } from "@/components/documents/document-extractor";

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Analisi Documenti</h1>
        <p className="text-sm text-muted-foreground">
          Carica una Visura Catastale, Planimetria, Atto di Provenienza o APE: i dati vengono estratti
          automaticamente con Claude AI.
        </p>
      </div>

      <ModuleWithHistory kind="DOCUMENT_EXTRACTION" workLabel="Analizza" emptyHint="Le visure e gli atti che analizzi restano qui: potrai rileggerli senza consumare un altro credito.">
        <DocumentExtractor />
      </ModuleWithHistory>
    </div>
  );
}
