import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfFooter, PdfHeader, pdfStyles, type PdfBranding } from "./document-pdf";
import {
  FEEDBACK_CATEGORY_LABELS,
  SENTIMENT_LABELS,
  type VoiceReportContent,
} from "@/lib/ai/report-schema";

const INTEREST_LABELS: Record<VoiceReportContent["interestLevel"], string> = {
  alto: "Interesse alto",
  medio: "Interesse medio",
  basso: "Interesse basso",
};

/** Report post-visita destinato al proprietario dell'immobile. */
export function SellerReportDocument({
  branding,
  report,
  propertyRef,
  sellerName,
}: {
  branding: PdfBranding;
  report: VoiceReportContent;
  propertyRef: string;
  sellerName: string | null;
}) {
  return (
    <Document
      title={`Report visita — ${propertyRef}`}
      author={branding.legalName ?? branding.agencyName}
    >
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader branding={branding} docType="Report post-visita" />

        <Text style={pdfStyles.badge}>{INTEREST_LABELS[report.interestLevel]}</Text>
        <Text style={pdfStyles.title}>{propertyRef}</Text>
        <Text style={pdfStyles.subtitle}>
          {sellerName ? `Report per ${sellerName}` : "Report per il proprietario"}
        </Text>

        <View style={pdfStyles.summaryBox}>
          <Text style={pdfStyles.summaryLabel}>Esito della visita</Text>
          <Text style={pdfStyles.summaryText}>{report.visitSummary}</Text>
        </View>

        <Text style={pdfStyles.sectionTitle}>Riscontri raccolti</Text>
        {report.feedback.length === 0 ? (
          <Text style={pdfStyles.paragraph}>Nessun riscontro specifico emerso dalla visita.</Text>
        ) : (
          <View style={pdfStyles.table}>
            <View style={pdfStyles.tableHeader}>
              <Text style={[pdfStyles.th, { width: "25%" }]}>Aspetto</Text>
              <Text style={[pdfStyles.th, { width: "17%" }]}>Giudizio</Text>
              <Text style={[pdfStyles.th, { width: "58%" }]}>Dettaglio</Text>
            </View>
            {report.feedback.map((item, index) => (
              <View key={index} style={pdfStyles.tableRow} wrap={false}>
                <Text style={[pdfStyles.td, { width: "25%" }]}>
                  {FEEDBACK_CATEGORY_LABELS[item.category]}
                </Text>
                <Text style={[pdfStyles.td, { width: "17%" }]}>
                  {SENTIMENT_LABELS[item.sentiment]}
                </Text>
                <Text style={[pdfStyles.td, { width: "58%" }]}>{item.detail}</Text>
              </View>
            ))}
          </View>
        )}

        {report.priceObservation && (
          <>
            <Text style={pdfStyles.sectionTitle}>Osservazioni sul prezzo</Text>
            <Text style={pdfStyles.paragraph}>{report.priceObservation}</Text>
          </>
        )}

        <Text style={pdfStyles.sectionTitle}>Cosa suggeriamo</Text>
        {report.recommendedActions.map((action, index) => (
          <View key={index} style={pdfStyles.bullet} wrap={false}>
            <Text style={pdfStyles.bulletDot}>•</Text>
            <Text style={[pdfStyles.paragraph, { flex: 1, marginBottom: 0 }]}>{action}</Text>
          </View>
        ))}

        <PdfFooter branding={branding} />
      </Page>
    </Document>
  );
}
