import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfHeader, pdfStyles, type PdfBranding } from "./document-pdf";
import { BRAND } from "@/lib/brand";
import {
  calcolaIndice,
  calcolaVerdetto,
  ETICHETTA_PESO,
  ETICHETTA_STATO,
  statoDi,
  VOCI,
  type MappaNote,
  type MappaStati,
} from "@/lib/audit/checklist";

/**
 * Il riepilogo della verifica documentale, da portarsi in appuntamento.
 *
 * # Perché non porta il disclaimer sugli output AI
 *
 * Perché qui non c'è niente generato da un modello: gli stati li segna
 * l'agente, voce per voce. `AI_DISCLAIMER` va sugli output dell'AI
 * (CLAUDE.md §5), e metterlo dove non serve lo rende rumore anche dove serve.
 *
 * # Il limite, invece, c'è e sta in fondo alla prima pagina
 *
 * Questo documento può finire in mano al proprietario o a un acquirente, che
 * lo leggerebbero come un certificato. Non lo è: dice cosa risulta all'agenzia
 * a una certa data, non cosa è conforme. La riga che lo dichiara non è una
 * formalità legale, è la differenza fra uno strumento di lavoro e una
 * promessa che l'agenzia non può mantenere.
 */

export interface AuditInput {
  /** Riferimento dell'immobile: scheda di portafoglio o testo scritto a mano. */
  immobile: string;
  /** Dati della scheda, quando la checklist è collegata a un immobile. */
  dettagli?: {
    comune?: string | null;
    indirizzo?: string | null;
    riferimento?: string | null;
  };
  stati: MappaStati;
  note: MappaNote;
}

/** Colonne della tabella: la somma fa 100. */
const COLONNE = { voce: "46%", peso: "20%", stato: "14%", nota: "20%" } as const;

function Riga({
  titolo,
  peso,
  stato,
  nota,
  critica,
}: {
  titolo: string;
  peso: string;
  stato: string;
  nota: string;
  critica: boolean;
}) {
  return (
    <View style={pdfStyles.tableRow} wrap={false}>
      <Text style={[pdfStyles.td, { width: COLONNE.voce }]}>{titolo}</Text>
      <Text style={[pdfStyles.td, { width: COLONNE.peso, color: "#64748B" }]}>{peso}</Text>
      {/* Lo stato critico in rosso: su una pagina in bianco e nero resta
          comunque leggibile dal testo, ma a colori si trova a colpo d'occhio,
          che è come questa tabella viene guardata in appuntamento. */}
      <Text
        style={[
          pdfStyles.td,
          { width: COLONNE.stato, fontFamily: "Helvetica-Bold" },
          critica ? { color: "#DC2626" } : { color: "#15803D" },
        ]}
      >
        {stato}
      </Text>
      <Text style={[pdfStyles.td, { width: COLONNE.nota, color: "#475569" }]}>{nota}</Text>
    </View>
  );
}

export function AuditDocument({ branding, dati }: { branding: PdfBranding; dati: AuditInput }) {
  const titolo = dati.immobile.trim() || "Immobile senza riferimento";
  const verdetto = calcolaVerdetto(dati.stati);
  const indice = calcolaIndice(dati.stati);

  const dove = [dati.dettagli?.indirizzo, dati.dettagli?.comune].filter(Boolean).join(", ");

  const gruppi = [...new Set(VOCI.map((voce) => voce.gruppo))];

  return (
    <Document
      title={`Verifica documentale: ${titolo}`}
      author={branding.legalName ?? branding.agencyName}
    >
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader branding={branding} docType="Verifica documentale" />

        <Text style={pdfStyles.title}>{titolo}</Text>
        {dove && <Text style={pdfStyles.subtitle}>{dove}</Text>}

        {/* Il verdetto in cima, come nella schermata: è la risposta alla
            domanda per cui questo foglio viene stampato. */}
        <View style={pdfStyles.summaryBox}>
          <Text style={pdfStyles.summaryLabel}>{verdetto.titolo}</Text>
          <Text style={pdfStyles.summaryText}>{verdetto.testo}</Text>
        </View>

        <View style={pdfStyles.grid}>
          <View style={pdfStyles.gridCell}>
            <Text style={pdfStyles.fieldLabel}>Indice di vendibilità documentale</Text>
            <Text style={pdfStyles.fieldValue}>
              {indice.percentuale}% · {indice.aPosto} voci a posto su {indice.totale}
            </Text>
          </View>
          <View style={pdfStyles.gridCell}>
            <Text style={pdfStyles.fieldLabel}>Voci che possono fermare il rogito</Text>
            <Text style={pdfStyles.fieldValue}>
              {indice.bloccantiAperti === 0
                ? "Nessuna aperta"
                : `${indice.bloccantiAperti} ancora ${indice.bloccantiAperti === 1 ? "aperta" : "aperte"}`}
            </Text>
          </View>
        </View>

        {gruppi.map((gruppo) => (
          <View key={gruppo} wrap={false}>
            <Text style={pdfStyles.sectionTitle}>{gruppo}</Text>
            <View style={pdfStyles.table}>
              <View style={pdfStyles.tableHeader}>
                <Text style={[pdfStyles.th, { width: COLONNE.voce }]}>Controllo</Text>
                <Text style={[pdfStyles.th, { width: COLONNE.peso }]}>Rilevanza</Text>
                <Text style={[pdfStyles.th, { width: COLONNE.stato }]}>Esito</Text>
                <Text style={[pdfStyles.th, { width: COLONNE.nota }]}>Note</Text>
              </View>

              {VOCI.filter((voce) => voce.gruppo === gruppo).map((voce) => {
                const stato = statoDi(dati.stati, voce.id);
                return (
                  <Riga
                    key={voce.id}
                    titolo={voce.titolo}
                    peso={ETICHETTA_PESO[voce.peso]}
                    stato={ETICHETTA_STATO[stato]}
                    nota={dati.note[voce.id] ?? "—"}
                    critica={stato !== "ok"}
                  />
                );
              })}
            </View>
          </View>
        ))}

        {indice.critiche.length > 0 && (
          <>
            <Text style={pdfStyles.sectionTitle}>Da risolvere prima della proposta</Text>
            {indice.critiche.map((voce) => (
              <View key={voce.id} style={pdfStyles.bullet} wrap={false}>
                <Text style={pdfStyles.bulletDot}>•</Text>
                <Text style={[pdfStyles.paragraph, { flex: 1, marginBottom: 0 }]}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>{voce.titolo}</Text>
                  {` — ${voce.conseguenza} Da chiedere: ${voce.richiestaA}.`}
                </Text>
              </View>
            ))}
          </>
        )}

        <View style={pdfStyles.footer} fixed>
          <Text style={pdfStyles.disclaimer}>
            Questo documento riporta l&apos;esito di una verifica documentale svolta
            dall&apos;agenzia alla data indicata. Non certifica la conformità
            dell&apos;immobile e non sostituisce le verifiche del tecnico abilitato né quelle
            del notaio.
          </Text>
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
