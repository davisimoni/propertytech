import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfFooter, PdfHeader, pdfStyles, type PdfBranding } from "./document-pdf";
import { DOCUMENT_TYPE_LABELS, type DocumentExtractionResult } from "@/lib/ai/document-schema";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={pdfStyles.gridCell}>
      <Text style={pdfStyles.fieldLabel}>{label}</Text>
      <Text style={pdfStyles.fieldValue}>{value?.trim() || "—"}</Text>
    </View>
  );
}

/** Scheda catastale impaginata a partire dall'estrazione OCR. */
export function ExtractionDocument({
  branding,
  result,
}: {
  branding: PdfBranding;
  result: DocumentExtractionResult;
}) {
  const { datiImmobile: immobile, proprietari, noteVincoli } = result;

  return (
    <Document
      title={`Scheda catastale — ${immobile.indirizzo ?? immobile.comune ?? "immobile"}`}
      author={branding.legalName ?? branding.agencyName}
    >
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader branding={branding} docType="Scheda catastale" />

        <Text style={pdfStyles.badge}>{DOCUMENT_TYPE_LABELS[result.tipoDocumento]}</Text>
        <Text style={pdfStyles.title}>
          {immobile.indirizzo?.trim() || immobile.comune?.trim() || "Immobile"}
        </Text>
        {immobile.comune && immobile.indirizzo && (
          <Text style={pdfStyles.subtitle}>{immobile.comune}</Text>
        )}

        <View style={pdfStyles.summaryBox}>
          <Text style={pdfStyles.summaryLabel}>Sintesi per l&apos;agente</Text>
          <Text style={pdfStyles.summaryText}>{result.sintesiAgente}</Text>
        </View>

        <Text style={pdfStyles.sectionTitle}>Dati identificativi</Text>
        <View style={pdfStyles.grid}>
          <Field label="Comune" value={immobile.comune} />
          <Field label="Indirizzo" value={immobile.indirizzo} />
          <Field label="Foglio" value={immobile.foglio} />
          <Field label="Particella / Mappale" value={immobile.particella} />
          <Field label="Subalterno" value={immobile.subalterno} />
          <Field label="Categoria catastale" value={immobile.categoriaCatastale} />
          <Field label="Rendita catastale" value={immobile.renditaCatastale} />
        </View>

        <Text style={pdfStyles.sectionTitle}>Intestatari</Text>
        {proprietari.length === 0 ? (
          <Text style={pdfStyles.paragraph}>
            Nessun intestatario individuato nel documento caricato.
          </Text>
        ) : (
          <View style={pdfStyles.table}>
            <View style={pdfStyles.tableHeader}>
              <Text style={[pdfStyles.th, { width: "45%" }]}>Nome e cognome</Text>
              <Text style={[pdfStyles.th, { width: "35%" }]}>Codice fiscale</Text>
              <Text style={[pdfStyles.th, { width: "20%" }]}>Quota</Text>
            </View>
            {proprietari.map((proprietario, index) => (
              <View key={index} style={pdfStyles.tableRow} wrap={false}>
                <Text style={[pdfStyles.td, { width: "45%" }]}>{proprietario.nomeCognome}</Text>
                <Text style={[pdfStyles.td, { width: "35%" }]}>
                  {proprietario.codiceFiscale?.trim() || "—"}
                </Text>
                <Text style={[pdfStyles.td, { width: "20%" }]}>
                  {proprietario.quotaProprieta?.trim() || "—"}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={pdfStyles.sectionTitle}>Note e vincoli</Text>
        <Text style={pdfStyles.paragraph}>
          {noteVincoli.presenti
            ? (noteVincoli.dettagli?.trim() ||
              "Il documento riporta note o vincoli: verificarli sull'originale.")
            : "Nessuna nota o vincolo particolare rilevato nel documento."}
        </Text>

        <PdfFooter branding={branding} />
      </Page>
    </Document>
  );
}
