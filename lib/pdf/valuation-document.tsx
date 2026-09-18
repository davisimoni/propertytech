import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfHeader, pdfStyles, type PdfBranding } from "./document-pdf";
import { BRAND } from "@/lib/brand";

/**
 * Il documento che l'agente lascia al proprietario dopo la valutazione.
 *
 * # Perché non porta il disclaimer sugli output AI
 *
 * Perché qui non c'è niente generato da un modello: prezzo, interventi e piano
 * di promozione li scrive l'agente, che se ne assume la responsabilità come
 * farebbe su carta intestata. `AI_DISCLAIMER` va sugli output dell'AI
 * (CLAUDE.md §5), e metterlo dove non serve lo rende rumore anche dove serve.
 */

export interface ValuationInput {
  indirizzo: string;
  proprietario: string;
  prezzoConsigliato: string;
  prezzoRichiesto: string;
  superficie: string;
  puntiDiForza: string[];
  interventi: string[];
  promozione: string[];
  tempistiche: string;
  note: string;
}

function Elenco({ voci }: { voci: string[] }) {
  return (
    <View>
      {voci.map((voce, indice) => (
        <View key={`${indice}-${voce.slice(0, 12)}`} style={pdfStyles.bullet}>
          <Text style={pdfStyles.bulletDot}>•</Text>
          <Text style={[pdfStyles.paragraph, { flex: 1, marginBottom: 0 }]}>{voce}</Text>
        </View>
      ))}
    </View>
  );
}

export function ValuationDocument({
  branding,
  dati,
}: {
  branding: PdfBranding;
  dati: ValuationInput;
}) {
  const titolo = dati.indirizzo.trim() || "Immobile";

  return (
    <Document
      title={`Valorizzazione immobile: ${titolo}`}
      author={branding.legalName ?? branding.agencyName}
    >
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader branding={branding} docType="Valorizzazione immobile" />

        <Text style={pdfStyles.title}>{titolo}</Text>
        {dati.proprietario.trim() && (
          <Text style={pdfStyles.subtitle}>Preparato per {dati.proprietario.trim()}</Text>
        )}

        {dati.prezzoConsigliato.trim() && (
          <View style={pdfStyles.summaryBox}>
            <Text style={pdfStyles.summaryLabel}>Prezzo di presentazione consigliato</Text>
            <Text style={pdfStyles.summaryText}>
              {dati.prezzoConsigliato.trim()}
              {dati.prezzoRichiesto.trim()
                ? ` (valore di partenza indicato dalla proprietà: ${dati.prezzoRichiesto.trim()})`
                : ""}
            </Text>
          </View>
        )}

        {(dati.superficie.trim() || dati.tempistiche.trim()) && (
          <View style={pdfStyles.grid}>
            {dati.superficie.trim() && (
              <View style={pdfStyles.gridCell}>
                <Text style={pdfStyles.fieldLabel}>Superficie</Text>
                <Text style={pdfStyles.fieldValue}>{dati.superficie.trim()}</Text>
              </View>
            )}
            {dati.tempistiche.trim() && (
              <View style={pdfStyles.gridCell}>
                <Text style={pdfStyles.fieldLabel}>Tempi stimati di vendita</Text>
                <Text style={pdfStyles.fieldValue}>{dati.tempistiche.trim()}</Text>
              </View>
            )}
          </View>
        )}

        {dati.puntiDiForza.length > 0 && (
          <>
            <Text style={pdfStyles.sectionTitle}>Punti di forza dell&apos;immobile</Text>
            <Elenco voci={dati.puntiDiForza} />
          </>
        )}

        {dati.interventi.length > 0 && (
          <>
            <Text style={pdfStyles.sectionTitle}>Interventi che alzano il valore</Text>
            <Elenco voci={dati.interventi} />
          </>
        )}

        {dati.promozione.length > 0 && (
          <>
            <Text style={pdfStyles.sectionTitle}>Come promuoviamo il suo immobile</Text>
            <Elenco voci={dati.promozione} />
          </>
        )}

        {dati.note.trim() && (
          <>
            <Text style={pdfStyles.sectionTitle}>Note</Text>
            <Text style={pdfStyles.paragraph}>{dati.note.trim()}</Text>
          </>
        )}

        {/* Pie' di pagina senza il disclaimer sugli output AI: qui non c'e'
            niente generato da un modello, e un avviso fuori posto toglie peso
            a quello che compare sui documenti che lo richiedono davvero. */}
        <View style={pdfStyles.footer} fixed>
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
      </Page>
    </Document>
  );
}
