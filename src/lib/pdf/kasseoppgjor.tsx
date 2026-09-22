import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { DailyReconRow } from "@/lib/ops-queries";

/* =====================================================================
 * KASSEOPPGJØR – PDF (dag for dag)
 *   Pen, branded rapport over forventet vs. talt beløp per dag, med avvik.
 *   Samme stil som kundenes kjøpshistorikk-PDF. Node runtime.
 * ===================================================================== */

const INK = "#211E1A";
const MUTED = "#8a807a";
const LINE = "#e6ded3";
const ACCENT = "#F47721";
const SOFT = "#faf7f2";
const DANGER = "#c0392b";

const kr = (n: number) => `${Math.round(n).toLocaleString("nb-NO")} kr`;
const signedKr = (n: number) =>
  (n > 0 ? "+" : n < 0 ? "−" : "") +
  `${Math.abs(Math.round(n)).toLocaleString("nb-NO")} kr`;

function no(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
const sum = (b: { cash: number; card: number; vipps: number }) =>
  b.cash + b.card + b.vipps;

export type SettlementReport = {
  from: string;
  to: string;
  rows: DailyReconRow[];
};

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 44, fontFamily: "Helvetica", color: INK, fontSize: 10 },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  brand: { fontFamily: "Helvetica-Bold", fontSize: 16, letterSpacing: 1 },
  brandSub: { fontSize: 8, color: ACCENT, letterSpacing: 2, textTransform: "uppercase", marginTop: 2 },
  docType: { fontSize: 9, color: MUTED, textAlign: "right" },
  rule: { height: 2, backgroundColor: ACCENT, marginTop: 10, marginBottom: 18, width: 48 },

  title: { fontFamily: "Helvetica-Bold", fontSize: 20 },
  metaLine: { fontSize: 9, color: MUTED, marginTop: 4 },

  statRow: { flexDirection: "row", gap: 10, marginTop: 18, marginBottom: 22 },
  stat: { flex: 1, border: `1 solid ${LINE}`, borderRadius: 2, padding: 10 },
  statLabel: { fontSize: 7, color: MUTED, letterSpacing: 1, textTransform: "uppercase" },
  statValue: { fontFamily: "Helvetica-Bold", fontSize: 14, marginTop: 5 },

  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 8 },
  thead: { flexDirection: "row", backgroundColor: SOFT, borderTop: `1 solid ${LINE}`, borderBottom: `1 solid ${LINE}`, paddingVertical: 6, paddingHorizontal: 6 },
  th: { fontSize: 8, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase" },
  tr: { flexDirection: "row", borderBottom: `0.5 solid ${LINE}`, paddingVertical: 6, paddingHorizontal: 6 },
  cDate: { width: "22%" },
  cExp: { width: "20%", textAlign: "right" },
  cCnt: { width: "20%", textAlign: "right" },
  cDiff: { width: "23%", textAlign: "right" },
  cStat: { width: "15%", textAlign: "right" },
  muted: { color: MUTED },
  danger: { color: DANGER },
  footer: { position: "absolute", bottom: 28, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTop: `0.5 solid ${LINE}`, paddingTop: 8 },
  footerText: { fontSize: 8, color: MUTED },
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

function SettlementDoc({ r }: { r: SettlementReport }) {
  const generated = new Date().toLocaleString("nb-NO", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const settledRows = r.rows.filter((x) => x.settled && x.counted);
  const totalExpected = r.rows.reduce((a, x) => a + sum(x.expected), 0);
  const totalCounted = settledRows.reduce((a, x) => a + sum(x.counted!), 0);
  const totalDiff = settledRows.reduce((a, x) => a + (sum(x.counted!) - sum(x.expected)), 0);

  return (
    <Document title="Kasseoppgjør – dag for dag" author="Downtown Barbers">
      <Page size="A4" style={s.page}>
        <View style={s.brandRow}>
          <View>
            <Text style={s.brand}>DOWNTOWN BARBERS</Text>
            <Text style={s.brandSub}>Kasseoppgjør</Text>
          </View>
          <Text style={s.docType}>Generert {generated}</Text>
        </View>
        <View style={s.rule} />

        <Text style={s.title}>Kasseoppgjør – dag for dag</Text>
        <Text style={s.metaLine}>Periode {no(r.from)} – {no(r.to)}</Text>

        <View style={s.statRow}>
          <Stat label="Forventet totalt" value={kr(totalExpected)} />
          <Stat label="Talt (avstemte dager)" value={kr(totalCounted)} />
          <Stat label="Samlet avvik" value={signedKr(totalDiff)} />
        </View>

        <Text style={s.sectionTitle}>Dager</Text>
        <View style={s.thead}>
          <Text style={[s.th, s.cDate]}>Dato</Text>
          <Text style={[s.th, s.cExp]}>Forventet</Text>
          <Text style={[s.th, s.cCnt]}>Talt</Text>
          <Text style={[s.th, s.cDiff]}>Avvik</Text>
          <Text style={[s.th, s.cStat]}>Status</Text>
        </View>
        {r.rows.length === 0 ? (
          <View style={s.tr}>
            <Text style={s.muted}>Ingen salg eller oppgjør i perioden.</Text>
          </View>
        ) : (
          r.rows.map((x) => {
            const exp = sum(x.expected);
            const cnt = x.counted ? sum(x.counted) : null;
            const diff = cnt == null ? null : cnt - exp;
            return (
              <View style={s.tr} key={x.date} wrap={false}>
                <Text style={s.cDate}>{no(x.date)}</Text>
                <Text style={[s.cExp, s.muted]}>{kr(exp)}</Text>
                <Text style={s.cCnt}>{cnt == null ? "—" : kr(cnt)}</Text>
                <Text style={[s.cDiff, diff && diff !== 0 ? s.danger : s.muted]}>
                  {diff == null ? "—" : diff === 0 ? "✓ stemmer" : signedKr(diff)}
                </Text>
                <Text style={[s.cStat, s.muted]}>
                  {x.settled ? "Avstemt" : "Ikke avstemt"}
                </Text>
              </View>
            );
          })
        )}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>Downtown Barbers · downtownbarbers.no</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Side ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** Rendrer kasseoppgjør-PDF (dag for dag) til en Buffer (Node runtime). */
export function renderSettlementPdf(r: SettlementReport): Promise<Buffer> {
  return renderToBuffer(<SettlementDoc r={r} />);
}
