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
  (n > 0 ? "+" : n < 0 ? "-" : "") +
  `${Math.abs(Math.round(n)).toLocaleString("nb-NO")} kr`;

function no(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

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

  statRow: { flexDirection: "row", gap: 8, marginTop: 18, marginBottom: 22 },
  stat: { flex: 1, border: `1 solid ${LINE}`, borderRadius: 2, padding: 10 },
  statLabel: { fontSize: 7, color: MUTED, letterSpacing: 1, textTransform: "uppercase" },
  statValue: { fontFamily: "Helvetica-Bold", fontSize: 14, marginTop: 5 },

  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 8 },
  thead: { flexDirection: "row", backgroundColor: SOFT, borderTop: `1 solid ${LINE}`, borderBottom: `1 solid ${LINE}`, paddingVertical: 6, paddingHorizontal: 6 },
  th: { fontSize: 8, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase" },
  tr: { flexDirection: "row", borderBottom: `0.5 solid ${LINE}`, paddingVertical: 6, paddingHorizontal: 6 },
  cDate: { width: "10%" },
  cNum: { width: "8%", textAlign: "right" },
  cMoney: { width: "10%", textAlign: "right" },
  cDiff: { width: "10%", textAlign: "right" },
  cStat: { width: "12%", textAlign: "right" },
  sumRow: { flexDirection: "row", borderTop: `1 solid ${INK}`, paddingVertical: 7, paddingHorizontal: 6, fontFamily: "Helvetica-Bold" },
  note: { fontSize: 8, color: MUTED, marginTop: 10, lineHeight: 1.4 },
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
    timeZone: "Europe/Oslo",
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  // Eldste dag først (som Fixit).
  const rows = [...r.rows].sort((a, b) => a.date.localeCompare(b.date));
  const t = rows.reduce(
    (a, x) => {
      a.sales += x.salesTotal;
      a.count += x.salesCount;
      a.card += x.expected.card;
      a.vipps += x.expected.vipps;
      a.cash += x.expected.cash;
      a.gift += x.gift;
      a.other += x.other;
      if (x.counted) {
        a.cashCounted += x.counted.cash;
        a.cashDiff += x.counted.cash - x.expected.cash;
        a.settled += 1;
      }
      return a;
    },
    { sales: 0, count: 0, card: 0, vipps: 0, cash: 0, gift: 0, other: 0, cashCounted: 0, cashDiff: 0, settled: 0 },
  );
  const unsettled = rows.filter((x) => !x.settled && x.salesTotal > 0).length;

  return (
    <Document title={`Kasseoppgjør ${no(r.from)}–${no(r.to)}`} author="Downtown Barbers">
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.brandRow}>
          <View>
            <Text style={s.brand}>DOWNTOWN BARBERS</Text>
            <Text style={s.brandSub}>Kasseoppgjør</Text>
          </View>
          <Text style={s.docType}>Generert {generated} · alle beløp inkl. mva.</Text>
        </View>
        <View style={s.rule} />

        <Text style={s.title}>Kasseoppgjør {no(r.from)} – {no(r.to)}</Text>
        <Text style={s.metaLine}>
          {t.count} salg · {rows.length} dager med aktivitet · {t.settled} avstemt
          {unsettled ? ` · ${unsettled} uten oppgjør` : ""}
        </Text>

        <View style={s.statRow}>
          <Stat label="Totalt salg" value={kr(t.sales)} />
          <Stat label="Kort" value={kr(t.card)} />
          <Stat label="Vipps" value={kr(t.vipps)} />
          <Stat label="Kontant" value={kr(t.cash)} />
          <Stat label="Gavekort" value={kr(t.gift + t.other)} />
          <Stat label="Kontantavvik" value={signedKr(t.cashDiff)} />
        </View>

        <View style={s.thead} fixed>
          <Text style={[s.th, s.cDate]}>Dato</Text>
          <Text style={[s.th, s.cNum]}>Salg</Text>
          <Text style={[s.th, s.cMoney]}>Totalt</Text>
          <Text style={[s.th, s.cMoney]}>Kort</Text>
          <Text style={[s.th, s.cMoney]}>Vipps</Text>
          <Text style={[s.th, s.cMoney]}>Gavekort</Text>
          <Text style={[s.th, s.cMoney]}>Kontant forv.</Text>
          <Text style={[s.th, s.cMoney]}>Kontant talt</Text>
          <Text style={[s.th, s.cDiff]}>Avvik</Text>
          <Text style={[s.th, s.cStat]}>Status</Text>
        </View>
        {rows.length === 0 ? (
          <View style={s.tr}>
            <Text style={s.muted}>Ingen salg eller oppgjør i perioden.</Text>
          </View>
        ) : (
          rows.map((x) => {
            const cc = x.counted ? x.counted.cash : null;
            const diff = cc == null ? null : cc - x.expected.cash;
            return (
              <View style={s.tr} key={x.date} wrap={false}>
                <Text style={s.cDate}>{no(x.date)}</Text>
                <Text style={[s.cNum, s.muted]}>{x.salesCount}</Text>
                <Text style={s.cMoney}>{kr(x.salesTotal)}</Text>
                <Text style={[s.cMoney, s.muted]}>{kr(x.expected.card)}</Text>
                <Text style={[s.cMoney, s.muted]}>{kr(x.expected.vipps)}</Text>
                <Text style={[s.cMoney, s.muted]}>{kr(x.gift + x.other)}</Text>
                <Text style={[s.cMoney, s.muted]}>{kr(x.expected.cash)}</Text>
                <Text style={s.cMoney}>{cc == null ? "—" : kr(cc)}</Text>
                <Text style={[s.cDiff, diff ? s.danger : s.muted]}>
                  {diff == null ? "—" : diff === 0 ? "stemmer" : signedKr(diff)}
                </Text>
                <Text style={[s.cStat, s.muted]}>{x.settled ? "Avstemt" : "Ikke avstemt"}</Text>
              </View>
            );
          })
        )}
        <View style={s.sumRow} wrap={false}>
          <Text style={s.cDate}>Sum</Text>
          <Text style={s.cNum}>{t.count}</Text>
          <Text style={s.cMoney}>{kr(t.sales)}</Text>
          <Text style={s.cMoney}>{kr(t.card)}</Text>
          <Text style={s.cMoney}>{kr(t.vipps)}</Text>
          <Text style={s.cMoney}>{kr(t.gift + t.other)}</Text>
          <Text style={s.cMoney}>{kr(t.cash)}</Text>
          <Text style={s.cMoney}>{kr(t.cashCounted)}</Text>
          <Text style={[s.cDiff, t.cashDiff ? s.danger : {}]}>{signedKr(t.cashDiff)}</Text>
          <Text style={s.cStat}> </Text>
        </View>
        <Text style={s.note}>
          Kort og Vipps føres automatisk fra salgene i kassen. Bare kontantbeholdningen telles opp,
          og avviket gjelder kontant (talt minus forventet). Gavekort er innløste gavekort – ikke
          penger inn den dagen. Nettbutikk-ordrer som er fullført i kassen er med i salget.
        </Text>

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
