import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { PAYROLL, type PayrollRow } from "@/lib/ops-queries";

/* =====================================================================
 * LØNNSOVERSIKT – PDF
 *   Ren, månedlig lønnsoversikt per ansatt. Bygges server-side (Node
 *   runtime) og lastes opp til privat storage. Bruker innebygde fonter
 *   (Helvetica) for stabil serverless-generering. Satsene gjenbrukes
 *   fra PAYROLL – ingen egne satser her.
 * ===================================================================== */

const INK = "#211E1A";
const MUTED = "#8a807a";
const LINE = "#e6ded3";
const ACCENT = "#F47721";
const SOFT = "#faf7f2";

const MONTHS = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

const kr = (n: number) => `${Math.round(n).toLocaleString("nb-NO")} kr`;

const s = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    color: INK,
    fontSize: 10,
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  brand: { fontFamily: "Helvetica-Bold", fontSize: 16, letterSpacing: 1 },
  brandSub: {
    fontSize: 8,
    color: ACCENT,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  period: { fontSize: 9, color: MUTED, textAlign: "right" },
  rule: { height: 2, backgroundColor: ACCENT, marginTop: 10, marginBottom: 18, width: 48 },

  name: { fontFamily: "Helvetica-Bold", fontSize: 22 },
  metaLine: { fontSize: 9, color: MUTED, marginTop: 4 },

  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 24, marginBottom: 8 },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottom: `0.5 solid ${LINE}`,
    paddingVertical: 7,
  },
  rowLabel: { fontSize: 10, color: INK },
  rowLabelMuted: { fontSize: 10, color: MUTED },
  rowValue: { fontSize: 10, textAlign: "right" },
  rowValueMuted: { fontSize: 10, color: MUTED, textAlign: "right" },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: SOFT,
    border: `1 solid ${LINE}`,
  },
  totalLabel: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  totalValue: { fontFamily: "Helvetica-Bold", fontSize: 15 },

  note: { fontSize: 8, color: MUTED, marginTop: 22, lineHeight: 1.4 },

  footer: {
    position: "absolute",
    bottom: 28,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: `0.5 solid ${LINE}`,
    paddingTop: 8,
  },
  footerText: { fontSize: 8, color: MUTED },
});

function Line({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <View style={s.row}>
      <Text style={muted ? s.rowLabelMuted : s.rowLabel}>{label}</Text>
      <Text style={muted ? s.rowValueMuted : s.rowValue}>{value}</Text>
    </View>
  );
}

function PayslipDoc({
  row,
  year,
  month,
}: {
  row: PayrollRow;
  year: number;
  month: number;
}) {
  const monthName = MONTHS[month - 1] ?? String(month);
  const generated = new Date().toLocaleString("nb-NO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Document
      title={`Lønnsoversikt – ${row.name} – ${monthName} ${year}`}
      author="Downtown Barbers"
    >
      <Page size="A4" style={s.page}>
        {/* Merkevare-topp */}
        <View style={s.brandRow}>
          <View>
            <Text style={s.brand}>DOWNTOWN BARBERS</Text>
            <Text style={s.brandSub}>Lønnsoversikt</Text>
          </View>
          <Text style={s.period}>
            {monthName} {year}
          </Text>
        </View>
        <View style={s.rule} />

        {/* Ansatt */}
        <Text style={s.name}>{row.name}</Text>
        <Text style={s.metaLine}>{row.title ?? "Barber"}</Text>

        {/* Lønnslinjer */}
        <Text style={s.sectionTitle}>Beregning</Text>
        <Line label="Grunnlønn" value={kr(row.baseNok)} />
        <Line label="Omsetning (inkl. mva)" value={kr(row.grossNok)} muted />
        <Line label="Netto (eks. mva)" value={kr(row.netNok)} muted />
        <Line label="Terskel (eks. mva)" value={kr(PAYROLL.THRESHOLD_NOK)} muted />
        <Line label="Provisjonsgrunnlag" value={kr(row.commissionBaseNok)} muted />
        <Line
          label={`Provisjon (${Math.round(PAYROLL.RATE * 100)} %)`}
          value={kr(row.commissionNok)}
        />

        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Sum utbetalt</Text>
          <Text style={s.totalValue}>{kr(row.totalNok)}</Text>
        </View>

        <Text style={s.note}>
          Foreløpig lønnsoversikt basert på registrert omsetning – ikke en
          offisiell lønnsslip med skattetrekk.
        </Text>

        {/* Bunntekst med sidetall */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Downtown Barbers · downtownbarbers.no · Generert {generated}
          </Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) =>
              `Side ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

/** Rendrer én ansatts lønnsoversikt til en Buffer (Node runtime). */
export function renderPayslipPdf(
  row: PayrollRow,
  year: number,
  month: number,
): Promise<Buffer> {
  return renderToBuffer(<PayslipDoc row={row} year={year} month={month} />);
}
