import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { pdfStyles, PdfHeader, PdfFooter, type PdfBranding } from "./document-pdf";
import { PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";
import { OCCUPANCY_LABELS, RISK_LABELS } from "@/lib/radar/risk";
import { computeRoi } from "@/lib/radar/roi";
import type { OccupancyStatus, PropertyType, RiskLevel } from "@prisma/client";

/**
 * Report di un lotto, per il cliente o l'investitore.
 *
 * # Perché il semaforo esce con i suoi criteri
 *
 * Un colore su un foglio che finisce in mano a chi sta per impegnare
 * centinaia di migliaia di euro non può stare da solo. Le motivazioni sono
 * stampate accanto: chi legge deve poter vedere *perché* è giallo e non
 * fidarsi di un pallino.
 *
 * # Perché i conti dichiarano di essere lordi
 *
 * Un rendimento che ignora interessi, tempi di cantiere e sfitto è ottimista
 * esattamente di quelli. Il documento lo scrive dove sta il numero, non in
 * fondo in piccolo.
 */

const colori: Record<RiskLevel, { bg: string; fg: string }> = {
  VERDE: { bg: "#ECFDF5", fg: "#047857" },
  GIALLO: { bg: "#FFFBEB", fg: "#B45309" },
  ROSSO: { bg: "#FEF2F2", fg: "#B91C1C" },
};

const stili = StyleSheet.create({
  riga: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  etichetta: { fontSize: 9, color: "#64748B" },
  valore: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#0F172A" },
  sezione: { marginTop: 20 },
  titoloSezione: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  semaforo: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, marginBottom: 8 },
  semaforoTesto: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  voce: { fontSize: 9.5, color: "#334155", marginBottom: 4, lineHeight: 1.45 },
  kpiRiga: { flexDirection: "row", gap: 10, marginTop: 4 },
  kpi: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    padding: 10,
  },
  kpiEtichetta: { fontSize: 8, color: "#64748B" },
  kpiValore: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#0F172A", marginTop: 3 },
  kpiNota: { fontSize: 8, color: "#94A3B8", marginTop: 2 },
  nota: { fontSize: 8.5, color: "#64748B", marginTop: 10, lineHeight: 1.5 },
});

export interface RadarReportData {
  kind: "ASTA" | "RIBASSO";
  comune: string;
  zona: string | null;
  address: string | null;
  type: PropertyType;
  squareMeters: number;
  priceEur: number;
  basePriceEur: number | null;
  auctionDate: string | null;
  lotto: string | null;
  transferCostsEur: number | null;
  renovationCostEur: number | null;
  marketValueEur: number | null;
  monthlyRentEur: number | null;
  appraisal: {
    status: string;
    risk: RiskLevel;
    riskReasons: string[];
    occupancy: OccupancyStatus;
    irregularities: string[];
    encumbrances: string[];
    remediationCostMinEur: number | null;
    remediationCostMaxEur: number | null;
    summary: string | null;
  } | null;
}

const euro = (v: number) => `${new Intl.NumberFormat("it-IT").format(v)} €`;

function Riga({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <View style={stili.riga}>
      <Text style={stili.etichetta}>{etichetta}</Text>
      <Text style={stili.valore}>{valore}</Text>
    </View>
  );
}

export function RadarReportDocument({
  data,
  branding,
}: {
  data: RadarReportData;
  branding: PdfBranding;
}) {
  const roi = computeRoi({
    priceEur: data.priceEur,
    transferCostsEur: data.transferCostsEur,
    renovationCostEur: data.renovationCostEur,
    marketValueEur: data.marketValueEur,
    monthlyRentEur: data.monthlyRentEur,
  });

  const pronta = data.appraisal?.status === "PRONTA";
  const tinta = pronta ? colori[data.appraisal!.risk] : { bg: "#F1F5F9", fg: "#475569" };
  const luogo = [data.address, data.zona, data.comune].filter(Boolean).join(", ");

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader
          branding={branding}
          docType={data.kind === "ASTA" ? "Scheda lotto all'asta" : "Scheda immobile ribassato"}
        />

        <Text style={pdfStyles.title}>
          {PROPERTY_TYPE_LABELS[data.type]} — {data.comune}
        </Text>
        <Text style={pdfStyles.subtitle}>{luogo}</Text>

        {/* --- Dati dell'immobile --- */}
        <View style={stili.sezione}>
          <Text style={stili.titoloSezione}>Immobile</Text>
          <Riga etichetta="Tipologia" valore={PROPERTY_TYPE_LABELS[data.type]} />
          <Riga etichetta="Superficie" valore={`${data.squareMeters} mq`} />
          <Riga
            etichetta={data.kind === "ASTA" ? "Offerta minima" : "Prezzo richiesto"}
            valore={euro(data.priceEur)}
          />
          {data.basePriceEur !== null && (
            <Riga etichetta="Valore di perizia" valore={euro(data.basePriceEur)} />
          )}
          {data.auctionDate && (
            <Riga
              etichetta="Data della vendita"
              valore={new Date(data.auctionDate).toLocaleDateString("it-IT", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            />
          )}
          {data.lotto && <Riga etichetta="Lotto" valore={data.lotto} />}
        </View>

        {/* --- Sintesi e semaforo --- */}
        <View style={stili.sezione}>
          <Text style={stili.titoloSezione}>Analisi della perizia</Text>

          {pronta && data.appraisal ? (
            <>
              <View style={[stili.semaforo, { backgroundColor: tinta.bg }]}>
                <Text style={[stili.semaforoTesto, { color: tinta.fg }]}>
                  {RISK_LABELS[data.appraisal.risk]} · {OCCUPANCY_LABELS[data.appraisal.occupancy]}
                </Text>
              </View>

              {/* I criteri accanto al colore: chi legge deve vedere perché. */}
              {data.appraisal.riskReasons.map((r) => (
                <Text key={r} style={stili.voce}>
                  • {r}
                </Text>
              ))}

              {data.appraisal.summary && (
                <Text style={[stili.voce, { marginTop: 8 }]}>{data.appraisal.summary}</Text>
              )}

              {data.appraisal.irregularities.length > 0 && (
                <View style={{ marginTop: 10 }}>
                  <Text style={stili.titoloSezione}>Difformità rilevate</Text>
                  {data.appraisal.irregularities.map((v) => (
                    <Text key={v} style={stili.voce}>
                      • {v}
                    </Text>
                  ))}
                </View>
              )}

              {data.appraisal.encumbrances.length > 0 && (
                <View style={{ marginTop: 10 }}>
                  <Text style={stili.titoloSezione}>Vincoli e gravami</Text>
                  {data.appraisal.encumbrances.map((v) => (
                    <Text key={v} style={stili.voce}>
                      • {v}
                    </Text>
                  ))}
                </View>
              )}
            </>
          ) : (
            <Text style={stili.voce}>
              La perizia non è stata ancora analizzata: questo report non contiene la valutazione
              dello stato occupazionale né delle difformità.
            </Text>
          )}
        </View>

        {/* --- Simulazione economica --- */}
        <View style={stili.sezione} wrap={false}>
          <Text style={stili.titoloSezione}>Simulazione economica</Text>

          <View style={stili.kpiRiga}>
            <View style={stili.kpi}>
              <Text style={stili.kpiEtichetta}>Capitale investito</Text>
              <Text style={stili.kpiValore}>{euro(roi.totalInvestedEur)}</Text>
              <Text style={stili.kpiNota}>base + sanatoria + imposte</Text>
            </View>
            <View style={stili.kpi}>
              <Text style={stili.kpiEtichetta}>Margine sulla rivendita</Text>
              <Text style={stili.kpiValore}>
                {roi.flipRoiPct !== null ? `${roi.flipRoiPct}%` : "—"}
              </Text>
              <Text style={stili.kpiNota}>
                {roi.flipMarginEur !== null ? euro(roi.flipMarginEur) : "valore di mercato non indicato"}
              </Text>
            </View>
            <View style={stili.kpi}>
              <Text style={stili.kpiEtichetta}>Rendimento lordo annuo</Text>
              <Text style={stili.kpiValore}>
                {roi.grossYieldPct !== null ? `${roi.grossYieldPct}%` : "—"}
              </Text>
              <Text style={stili.kpiNota}>
                {data.monthlyRentEur !== null
                  ? `${euro(data.monthlyRentEur)} al mese`
                  : "canone non indicato"}
              </Text>
            </View>
          </View>

          <Text style={stili.nota}>
            Sono stime lorde: non comprendono interessi su eventuali finanziamenti, tempi di
            aggiudicazione e di cantiere, costi di gestione, sfitto né imposte sulla plusvalenza.
            {data.kind === "ASTA" &&
              " Si tratta di una vendita giudiziaria: condizioni, termini e modalità di partecipazione sono stabiliti dal Tribunale."}
          </Text>
        </View>

        <PdfFooter branding={branding} />
      </Page>
    </Document>
  );
}
