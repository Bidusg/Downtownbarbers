import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { SalaryReportEntry } from "@/lib/salary/report";
import type { SalaryLine } from "@/lib/salary/types";

/* =====================================================================
 * LØNNSRAPPORT – PDF (samlet for valgte ansatte)
 *   Side 1: samleoversikt for alle valgte. Deretter én side per ansatt i
 *   samme oppsett som Fixit-rapporten: grunnlønn, tillegg, overtid,
 *   provisjon, fravær/ferie, manuelle linjer, brutto → skattetrekk →
 *   netto, snittlønn per time og «Hvordan provisjon er regnet ut».
 *   Tallene er de samme som på lønnssiden per ansatt (computeSalary).
 * ===================================================================== */

const INK = "#211E1A";
const MUTED = "#7d746e";
const LINE = "#d9d1c6";
const SOFT = "#f4f1ec";
const HEAD = "#e4e0da";
const ACCENT = "#F47721";

const money = (n: number) =>
  (n < 0 ? "-" : "") +
  Math.abs(n).toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hrs = (n: number) =>
  n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

type Section = { title: string; keys: (k: string) => boolean };
const SECTIONS: Section[] = [
  { title: "Grunnlønn", keys: (k) => k === "grunnlonn" || k.startsWith("trekk-") },
  { title: "Tillegg", keys: (k) => ["kveldstillegg", "lordagstillegg", "sondagstillegg"].includes(k) },
  { title: "Overtid og helligdag", keys: (k) => k.startsWith("overtid-") || k === "helligdag" },
  { title: "Provisjon", keys: (k) => k.includes("provisjon") },
  { title: "Fravær og ferie", keys: (k) => ["sykefravaer", "ferielonn", "feriebonus"].includes(k) },
  { title: "Andre tillegg og trekk", keys: (k) => k.startsWith("manuell-") },
];

function method(e: SalaryReportEntry): string {
  const base = e.context.staffBaseSalaryNok > 0 || e.settings.baseSalaryOverrideNok;
  const comm = e.result.lines.some((l) => l.key.includes("provisjon") && l.amountNok > 0);
  const commPossible =
    e.settings.commissionModel === "split" ||
    e.settings.commissionRate > 0;
  if (base && (comm || commPossible)) return "Grunnlønn + provisjon";
  if (base) return "Grunnlønn";
  return "Provisjon";
}

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 44, paddingHorizontal: 30, fontFamily: "Helvetica", color: INK, fontSize: 8.5 },
  titleBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: HEAD, border: `0.75 solid ${LINE}`, paddingVertical: 5, paddingHorizontal: 8 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 13 },
  stamp: { fontSize: 7.5, color: MUTED },
  infoRow: { flexDirection: "row", gap: 14, marginTop: 10 },
  infoBox: { flex: 1, border: `0.75 solid ${INK}` },
  infoLine: { flexDirection: "row", borderBottom: `0.5 solid ${LINE}` },
  infoKey: { width: 82, fontFamily: "Helvetica-Bold", paddingVertical: 3, paddingHorizontal: 4, borderRight: `0.5 solid ${LINE}` },
  infoVal: { flex: 1, paddingVertical: 3, paddingHorizontal: 4 },
  box: { border: `0.75 solid ${INK}`, marginTop: 8 },
  secHead: { flexDirection: "row", backgroundColor: SOFT, borderBottom: `0.5 solid ${LINE}`, paddingVertical: 3, paddingHorizontal: 5 },
  secTitle: { fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  row: { flexDirection: "row", paddingVertical: 2.5, paddingHorizontal: 5, borderBottom: `0.4 solid ${LINE}` },
  cLabel: { width: "30%" },
  cFormula: { width: "52%", color: MUTED, fontSize: 7.5 },
  cAmt: { width: "18%", textAlign: "right" },
  sumRow: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 5, fontFamily: "Helvetica-Bold" },
  bigRow: { flexDirection: "row", paddingVertical: 3.5, paddingHorizontal: 5, fontFamily: "Helvetica-Bold", fontSize: 9.5, borderTop: `0.75 solid ${INK}` },
  muted: { color: MUTED },
  danger: { color: "#b03a2e" },
  stub: { color: ACCENT, fontSize: 6.5 },
  h2: { fontFamily: "Helvetica-Bold", fontSize: 10, backgroundColor: SOFT, paddingVertical: 4, paddingHorizontal: 5, borderBottom: `0.5 solid ${LINE}` },
  note: { fontSize: 7, color: MUTED, marginTop: 6, lineHeight: 1.35 },
  footer: { position: "absolute", bottom: 18, left: 30, right: 30, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: MUTED },
  // Samleoversikt
  tHead: { flexDirection: "row", backgroundColor: SOFT, borderTop: `0.75 solid ${INK}`, borderBottom: `0.75 solid ${INK}`, paddingVertical: 4, paddingHorizontal: 4 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7 },
  tRow: { flexDirection: "row", borderBottom: `0.4 solid ${LINE}`, paddingVertical: 4, paddingHorizontal: 4 },
  tSum: { flexDirection: "row", borderTop: `0.75 solid ${INK}`, paddingVertical: 4, paddingHorizontal: 4, fontFamily: "Helvetica-Bold" },
});

const COLS = [
  { k: "name", w: "19%", label: "Ansatt", align: "left" as const },
  { k: "method", w: "13%", label: "Beregning", align: "left" as const },
  { k: "hours", w: "7%", label: "Timer", align: "right" as const },
  { k: "base", w: "9%", label: "Grunnlønn", align: "right" as const },
  { k: "comm", w: "9%", label: "Provisjon", align: "right" as const },
  { k: "extra", w: "9%", label: "Tillegg/annet", align: "right" as const },
  { k: "corr", w: "8%", label: "Korreksjon", align: "right" as const },
  { k: "gross", w: "9%", label: "Brutto", align: "right" as const },
  { k: "tax", w: "8%", label: "Skattetrekk", align: "right" as const },
  { k: "net", w: "9%", label: "Netto", align: "right" as const },
];

function sumKeys(lines: SalaryLine[], pred: (k: string) => boolean) {
  return lines.filter((l) => pred(l.key)).reduce((a, l) => a + l.amountNok, 0);
}

function summaryValues(e: SalaryReportEntry) {
  const base = sumKeys(e.result.lines, SECTIONS[0].keys);
  const comm = sumKeys(e.result.lines, SECTIONS[3].keys);
  return {
    name: e.name,
    method: method(e),
    hours: e.result.hours,
    base,
    comm,
    extra: e.result.totalNok - base - comm,
    corr: e.result.correctionNok,
    gross: e.result.grossNok,
    tax: e.result.taxNok,
    net: e.result.netNok,
  };
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text>Downtown Barbers · downtownbarbers.no</Text>
      <Text render={({ pageNumber, totalPages }) => `Side ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function Summary({ entries, periodLabel, stamp }: { entries: SalaryReportEntry[]; periodLabel: string; stamp: string }) {
  const vals = entries.map(summaryValues);
  const tot = vals.reduce(
    (a, v) => ({
      hours: a.hours + v.hours,
      base: a.base + v.base,
      comm: a.comm + v.comm,
      extra: a.extra + v.extra,
      corr: a.corr + v.corr,
      gross: a.gross + v.gross,
      tax: a.tax + v.tax,
      net: a.net + v.net,
    }),
    { hours: 0, base: 0, comm: 0, extra: 0, corr: 0, gross: 0, tax: 0, net: 0 },
  );
  const cell = (v: ReturnType<typeof summaryValues> | typeof tot, k: string) => {
    const x = (v as Record<string, unknown>)[k];
    if (typeof x === "string") return x;
    if (k === "hours") return hrs(Number(x) || 0);
    return money(Number(x) || 0);
  };
  return (
    <Page size="A4" orientation="landscape" style={s.page}>
      <View style={s.titleBar}>
        <Text style={s.title}>Lønnsrapport – samlet</Text>
        <Text style={s.stamp}>{stamp}</Text>
      </View>
      <View style={s.infoRow}>
        <View style={s.infoBox}>
          <View style={s.infoLine}><Text style={s.infoKey}>Firma</Text><Text style={s.infoVal}>Downtown Barbers AS</Text></View>
          <View style={s.infoLine}><Text style={s.infoKey}>Periode</Text><Text style={s.infoVal}>{periodLabel}</Text></View>
          <View style={[s.infoLine, { borderBottom: 0 }]}><Text style={s.infoKey}>Ansatte</Text><Text style={s.infoVal}>{entries.length}</Text></View>
        </View>
        <View style={s.infoBox}>
          <View style={s.infoLine}><Text style={s.infoKey}>Sum brutto</Text><Text style={s.infoVal}>{money(tot.gross)} kr</Text></View>
          <View style={s.infoLine}><Text style={s.infoKey}>Skattetrekk</Text><Text style={s.infoVal}>{money(tot.tax)} kr</Text></View>
          <View style={[s.infoLine, { borderBottom: 0 }]}><Text style={s.infoKey}>Sum netto</Text><Text style={s.infoVal}>{money(tot.net)} kr</Text></View>
        </View>
      </View>

      <View style={[s.tHead, { marginTop: 14 }]}>
        {COLS.map((c) => (
          <Text key={c.k} style={[s.th, { width: c.w, textAlign: c.align }]}>{c.label}</Text>
        ))}
      </View>
      {vals.map((v, i) => (
        <View key={i} style={s.tRow} wrap={false}>
          {COLS.map((c) => (
            <Text key={c.k} style={{ width: c.w, textAlign: c.align }}>{cell(v, c.k)}</Text>
          ))}
        </View>
      ))}
      <View style={s.tSum}>
        {COLS.map((c) => (
          <Text key={c.k} style={{ width: c.w, textAlign: c.align }}>
            {c.k === "name" ? "Sum" : c.k === "method" ? "" : cell(tot, c.k)}
          </Text>
        ))}
      </View>
      <Text style={s.note}>
        Alle beløp i kr. Tallene er de samme som på lønnssiden per ansatt (Revisor → Ansatte). Tillegg/annet
        = kvelds-/lørdags-/søndagstillegg, overtid, helligdag, sykelønn, ferielønn/-bonus og manuelle
        tillegg og trekk. Skattetrekk er prosent fra skattekortet eller fast trekk lagt inn for måneden.
      </Text>
      <Footer />
    </Page>
  );
}

function EmployeePage({ e, periodLabel, stamp }: { e: SalaryReportEntry; periodLabel: string; stamp: string }) {
  const r = e.result;
  const ctx = e.context;
  const netExVat = ctx.grossInclVatNok / (1 + ctx.mva);
  const used = new Set<string>();
  const sections = SECTIONS.map((sec) => {
    const lines = r.lines.filter((l) => sec.keys(l.key));
    lines.forEach((l) => used.add(l.key));
    return { ...sec, lines };
  });
  const rest = r.lines.filter((l) => !used.has(l.key));
  if (rest.length) sections.push({ title: "Annet", keys: () => false, lines: rest });

  return (
    <Page size="A4" style={s.page}>
      <View style={s.titleBar}>
        <Text style={s.title}>Lønnsrapport</Text>
        <Text style={s.stamp}>{stamp}</Text>
      </View>

      <View style={s.infoRow}>
        <View style={s.infoBox}>
          <View style={s.infoLine}><Text style={s.infoKey}>Ansatt</Text><Text style={s.infoVal}>{e.name}</Text></View>
          <View style={s.infoLine}><Text style={s.infoKey}>Stilling</Text><Text style={s.infoVal}>{e.title ?? "Barber"}</Text></View>
          <View style={[s.infoLine, { borderBottom: 0 }]}><Text style={s.infoKey}>Beregningsmåte</Text><Text style={s.infoVal}>{method(e)}</Text></View>
        </View>
        <View style={s.infoBox}>
          <View style={s.infoLine}><Text style={s.infoKey}>Firma</Text><Text style={s.infoVal}>Downtown Barbers AS</Text></View>
          <View style={s.infoLine}><Text style={s.infoKey}>Periode</Text><Text style={s.infoVal}>{periodLabel}</Text></View>
          <View style={[s.infoLine, { borderBottom: 0 }]}><Text style={s.infoKey}>Kontonr</Text><Text style={s.infoVal}>{e.settings.accountNumber || "—"}</Text></View>
        </View>
      </View>

      <View style={s.box}>
        <View style={s.row}>
          <Text style={s.cLabel}>Timer</Text>
          <Text style={s.cFormula}>
            {r.hours > 0
              ? `${hrs(r.hours)} timer ${e.period.workedHours != null ? "(registrert)" : "(fra turnusen)"}`
              : "ingen timer registrert"}
            {r.hourlyRateNok > 0 ? ` · timesats ${money(r.hourlyRateNok)} kr (fastlønn ÷ ${hrs(e.settings.hoursPerMonth)} t)` : ""}
          </Text>
          <Text style={s.cAmt}></Text>
        </View>
        <View style={[s.row, { borderBottom: 0 }]}>
          <Text style={s.cLabel}>Dager ansatt / fravær</Text>
          <Text style={s.cFormula}>
            {ctx.employedDays} av {ctx.daysInMonth} dager
            {ctx.absenceDays > 0 ? ` · ${hrs(ctx.absenceDays)} trekk-dager av ${ctx.workdays} arbeidsdager` : ""}
          </Text>
          <Text style={s.cAmt}></Text>
        </View>
      </View>

      <View style={s.box}>
        {sections.map((sec) => {
          const sum = sec.lines.reduce((a, l) => a + l.amountNok, 0);
          return (
            <View key={sec.title} wrap={false}>
              <View style={s.secHead}>
                <Text style={[s.secTitle, { width: "82%" }]}>{sec.title}</Text>
                <Text style={[s.secTitle, s.cAmt]}>{sec.lines.length ? money(sum) : "0,00"}</Text>
              </View>
              {sec.lines.length === 0 ? (
                <View style={s.row}>
                  <Text style={[s.cLabel, s.muted]}>—</Text>
                  <Text style={s.cFormula}></Text>
                  <Text style={[s.cAmt, s.muted]}>0,00</Text>
                </View>
              ) : (
                sec.lines.map((l) => (
                  <View key={l.key} style={s.row}>
                    <Text style={s.cLabel}>
                      {l.label}
                      {l.stubbed ? <Text style={s.stub}>  forenklet</Text> : null}
                    </Text>
                    <Text style={s.cFormula}>{l.formula}</Text>
                    <Text style={[s.cAmt, l.amountNok < 0 ? s.danger : {}]}>{money(l.amountNok)}</Text>
                  </View>
                ))
              )}
            </View>
          );
        })}
        <View style={s.bigRow}>
          <Text style={{ width: "82%" }}>Sum beregnet lønn</Text>
          <Text style={s.cAmt}>{money(r.totalNok)}</Text>
        </View>
        <View style={s.row}>
          <Text style={{ width: "82%" }}>Korreksjon for periode</Text>
          <Text style={[s.cAmt, r.correctionNok < 0 ? s.danger : {}]}>{money(r.correctionNok)}</Text>
        </View>
        <View style={s.bigRow}>
          <Text style={{ width: "82%" }}>Sum BRUTTO lønn</Text>
          <Text style={s.cAmt}>{money(r.grossNok)}</Text>
        </View>
        <View style={s.row}>
          <Text style={{ width: "30%" }}>- Skattetrekk</Text>
          <Text style={s.cFormula}>
            {e.period.taxNok != null
              ? "fast trekk for måneden"
              : `${hrs(e.settings.taxPercent * 100)} % av brutto`}
          </Text>
          <Text style={s.cAmt}>{money(r.taxNok)}</Text>
        </View>
        <View style={s.bigRow}>
          <Text style={{ width: "82%" }}>Sum NETTO lønn</Text>
          <Text style={s.cAmt}>{money(r.netNok)}</Text>
        </View>
      </View>

      <View style={s.box} wrap={false}>
        <View style={s.sumRow}>
          <Text style={{ width: "82%" }}>Beregnet snittlønn pr time (BRUTTO) denne måneden:</Text>
          <Text style={s.cAmt}>{r.avgPerHourNok > 0 ? money(r.avgPerHourNok) : "—"}</Text>
        </View>
        <View style={s.sumRow}>
          <Text style={{ width: "82%" }}>Grunnlag for fremtidig sykelønnsberegning (brutto denne måneden):</Text>
          <Text style={s.cAmt}>{money(r.grossNok)}</Text>
        </View>
      </View>

      <View style={s.box} wrap={false}>
        <Text style={s.h2}>Hvordan provisjon er regnet ut</Text>
        {e.settings.commissionModel === "terskel" ? (
          <>
            <View style={s.row}>
              <Text style={s.cLabel}>Omsetning</Text>
              <Text style={s.cFormula}>
                {money(ctx.grossInclVatNok)} inkl. mva · {money(netExVat)} eks. mva
                {r.hours > 0 ? ` · ${money((e.settings.commissionExVat ? netExVat : ctx.grossInclVatNok) / r.hours)} kr/time` : ""}
              </Text>
              <Text style={s.cAmt}></Text>
            </View>
            <View style={s.row}>
              <Text style={s.cLabel}>Modell</Text>
              <Text style={s.cFormula}>
                {Math.round(e.settings.commissionRate * 100)} % av omsetning {e.settings.commissionExVat ? "eks." : "inkl."} mva over
                terskel {money(e.settings.commissionThresholdNok)} kr (trinnvis: alt under terskelen gir 0)
              </Text>
              <Text style={s.cAmt}></Text>
            </View>
          </>
        ) : (
          <>
            <View style={s.row}>
              <Text style={s.cLabel}>Behandling</Text>
              <Text style={s.cFormula}>
                grunnlag {money(e.settings.commissionExVat ? ctx.serviceInclVatNok / (1 + ctx.mva) : ctx.serviceInclVatNok)} kr ·
                sats {Math.round(e.settings.serviceRate * 100)} %
              </Text>
              <Text style={s.cAmt}></Text>
            </View>
            <View style={s.row}>
              <Text style={s.cLabel}>Varesalg</Text>
              <Text style={s.cFormula}>
                grunnlag {money(e.settings.commissionExVat ? ctx.productInclVatNok / (1 + ctx.mva) : ctx.productInclVatNok)} kr ·
                sats {Math.round(e.settings.productRate * 100)} %
              </Text>
              <Text style={s.cAmt}></Text>
            </View>
          </>
        )}
        <View style={[s.sumRow, { borderTop: `0.5 solid ${LINE}` }]}>
          <Text style={{ width: "82%" }}>Sum provisjon</Text>
          <Text style={s.cAmt}>{money(sumKeys(r.lines, SECTIONS[3].keys))}</Text>
        </View>
      </View>

      {e.period.note ? <Text style={s.note}>Merknad: {e.period.note}</Text> : null}
      <Footer />
    </Page>
  );
}

export function renderSalaryReportPdf(args: {
  year: number;
  month: number;
  entries: SalaryReportEntry[];
}): Promise<Buffer> {
  const periodLabel = `${MONTHS[args.month - 1]} ${args.year}`;
  const stamp = new Date().toLocaleString("nb-NO", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return renderToBuffer(
    <Document title={`Lønnsrapport ${periodLabel}`} author="Downtown Barbers">
      {args.entries.length > 1 && (
        <Summary entries={args.entries} periodLabel={periodLabel} stamp={stamp} />
      )}
      {args.entries.map((e) => (
        <EmployeePage key={e.staffId} e={e} periodLabel={periodLabel} stamp={stamp} />
      ))}
    </Document>,
  );
}
