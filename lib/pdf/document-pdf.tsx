/**
 * Documento PDF isomorfo: gira nel browser, non sul server.
 *
 * PERCHÉ NON SUL SERVER. Nelle route handler di Next il grafo usa un React
 * vendorizzato (19.2 canary), mentre `@react-pdf/reconciler` sceglie la propria
 * variante dalla versione del React che importa lui — 18.3.1 da node_modules —
 * e finisce per cercare elementi con firma `react.element` mentre la rotta ne
 * produce con firma `react.transitional.element`. Il rendering muore con
 * l'errore React #31 su **qualunque** documento, anche di due righe.
 *
 * Nel bundle del browser c'è un solo React, quindi le due parti si riconoscono.
 */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { AI_DISCLAIMER } from "@/lib/compliance";
import { BRAND } from "@/lib/brand";

export interface PdfBranding {
  agencyName: string;
  legalName: string | null;
  logoDataUrl: string | null;
}

/**
 * Stili del PDF.
 *
 * I colori sono i valori esatti del brand: @react-pdf non conosce le variabili
 * CSS del tema, quindi vanno ripetuti qui. Non è tema chiaro/scuro — un
 * documento stampato è sempre su fondo bianco.
 */
export const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 64,
    paddingHorizontal: 44,
    fontSize: 10,
    color: "#0F172A",
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: "#0066FF",
    paddingBottom: 12,
    marginBottom: 22,
  },
  logo: { height: 38, maxWidth: 150, objectFit: "contain" },
  agencyName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#031735" },
  legalName: { fontSize: 8, color: "#64748B", marginTop: 2 },
  headerRight: { alignItems: "flex-end" },
  docType: { fontSize: 8, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 },
  docDate: { fontSize: 9, color: "#0F172A", marginTop: 3 },

  title: { fontSize: 19, fontFamily: "Helvetica-Bold", color: "#031735" },
  subtitle: { fontSize: 10, color: "#64748B", marginTop: 4 },

  summaryBox: {
    backgroundColor: "#EFF6FF",
    borderLeftWidth: 3,
    borderLeftColor: "#0066FF",
    padding: 12,
    marginTop: 18,
  },
  summaryLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#0066FF",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  summaryText: { fontSize: 10.5, lineHeight: 1.5, marginTop: 5 },

  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 22,
    marginBottom: 8,
  },

  grid: { flexDirection: "row", flexWrap: "wrap" },
  gridCell: { width: "50%", paddingRight: 12, marginBottom: 9 },
  fieldLabel: { fontSize: 8, color: "#64748B" },
  fieldValue: { fontSize: 10.5, marginTop: 1.5 },

  table: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 3 },
  tableHeader: { flexDirection: "row", backgroundColor: "#F1F5F9" },
  tableRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#475569", padding: 7 },
  td: { fontSize: 9.5, padding: 7 },

  paragraph: { fontSize: 10.5, lineHeight: 1.5, marginBottom: 6 },
  bullet: { flexDirection: "row", marginBottom: 4 },
  bulletDot: { width: 12, fontSize: 10.5, color: "#0066FF" },

  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#EFF6FF",
    color: "#0066FF",
    fontSize: 8.5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 9,
    marginBottom: 4,
  },

  footer: {
    position: "absolute",
    bottom: 26,
    left: 44,
    right: 44,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 8,
  },
  disclaimer: { fontSize: 7.5, color: "#64748B", lineHeight: 1.4 },
  footerMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  footerText: { fontSize: 7, color: "#94A3B8" },
});

const DATE_FORMAT = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Rome",
});

/** Intestazione con il logo dell'agenzia cliente. */
export function PdfHeader({ branding, docType }: { branding: PdfBranding; docType: string }) {
  return (
    <View style={pdfStyles.header}>
      <View>
        {branding.logoDataUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer non supporta alt
          <Image src={branding.logoDataUrl} style={pdfStyles.logo} />
        ) : (
          <Text style={pdfStyles.agencyName}>{branding.agencyName}</Text>
        )}
        {branding.legalName && <Text style={pdfStyles.legalName}>{branding.legalName}</Text>}
      </View>

      <View style={pdfStyles.headerRight}>
        <Text style={pdfStyles.docType}>{docType}</Text>
        <Text style={pdfStyles.docDate}>{DATE_FORMAT.format(new Date())}</Text>
      </View>
    </View>
  );
}

/**
 * Piè di pagina con il disclaimer sugli output AI.
 *
 * `fixed` lo ripete su ogni pagina: un documento che esce dall'agenzia deve
 * riportare l'avvertenza anche se il lettore si ferma alla seconda pagina.
 */
export function PdfFooter({ branding }: { branding: PdfBranding }) {
  return (
    <View style={pdfStyles.footer} fixed>
      <Text style={pdfStyles.disclaimer}>{AI_DISCLAIMER}</Text>
      <View style={pdfStyles.footerMeta}>
        <Text style={pdfStyles.footerText}>
          {branding.legalName ?? branding.agencyName} · Documento generato con {BRAND.name}
        </Text>
        <Text
          style={pdfStyles.footerText}
          render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} di ${totalPages}`}
        />
      </View>
    </View>
  );
}

export { Document, Page, Text, View };
