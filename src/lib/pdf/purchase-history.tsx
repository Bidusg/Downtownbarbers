import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

/* =====================================================================
 * KJØPSHISTORIKK – PDF
 *   Pen, branded PDF over en kundes booking-/kjøpshistorikk. Bygges
 *   server-side (Node runtime) og streames som nedlasting.
 *   Bruker innebygde fonter (Helvetica) for stabil serverless-generering.
 * ===================================================================== */

export type PurchaseHistoryData = {
  full_name: string;
  phone: string | null;
  email: string | null;
  category: string | null;
  created_at: string;
  visits: number;
  totalSpent: number;
  noShows: number;
  lastVisit: string | null;
  bookings: {
    id: string;
    start_at: string;
    status: string;
    price_nok: number;
    service: string;
    barber: string;
  }[];
};

const INK = "#211E1A";
const MUTED = "#8a807a";
const LINE = "#e6ded3";
const ACCENT = "#F47721";
const SOFT = "#faf7f2";

const STATUS: Record<string, string> = {
  pending: "Venter",
  confirmed: "Bekreftet",
  completed: "Fullført",
  cancelled: "Avbestilt",
  no_show: "Ikke møtt",
};

const kr = (n: number) => `${Math.round(n).toLocaleString("nb-NO")} kr`;
function dt(iso: string | null, withTime = false) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("nb-NO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  } catch {
    return "—";
  }
}

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 44, fontFamily: "Helvetica", color: INK, fontSize: 10 },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  brand: { fontFamily: "Helvetica-Bold", fontSize: 16, letterSpacing: 1 },
  brandSub: { fontSize: 8, color: ACCENT, letterSpacing: 2, textTransform: "uppercase", marginTop: 2 },
  docType: { fontSize: 9, color: MUTED, textAlign: "right" },
  rule: { height: 2, backgroundColor: ACCENT, marginTop: 10, marginBottom: 18, width: 48 },

  name: { fontFamily: "Helvetica-Bold", fontSize: 22 },
  metaLine: { fontSize: 9, color: MUTED, marginTop: 4 },

  statRow: { flexDirection: "row", gap: 10, marginTop: 20, marginBottom: 22 },
  stat: { flex: 1, border: `1 solid ${LINE}`, borderRadius: 2, padding: 10 },
  statLabel: { fontSize: 7, color: MUTED, letterSpacing: 1, textTransform: "uppercase" },
  statValue: { fontFamily: "Helvetica-Bold", fontSize: 14, marginTop: 5 },

  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 8 },
  thead: { flexDirection: "row", backgroundColor: SOFT, borderTop: `1 solid ${LINE}`, borderBottom: `1 solid ${LINE}`, paddingVertical: 6, paddingHorizontal: 6 },
  th: { fontSize: 8, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase" },
  tr: { flexDirection: "row", borderBottom: `0.5 solid ${LINE}`, paddingVertical: 6, paddingHorizontal: 6 },
  cDate: { width: "24%" },
  cService: { width: "34%" },
  cBarber: { width: "20%" },
  cStatus: { width: "12%" },
  cAmount: { width: "10%", textAlign: "right" },
  sub: { fontSize: 8, color: MUTED, marginTop: 1 },
  muted: { color: MUTED },

  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14, paddingTop: 10, borderTop: `1 solid ${LINE}` },
  totalLabel: { fontSize: 10, color: MUTED, marginRight: 16, alignSelf: "center" },
  totalValue: { fontFamily: "Helvetica-Bold", fontSize: 15 },

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

function PurchaseHistoryDoc({ c }: { c: PurchaseHistoryData }) {
  const generated = new Date().toLocaleString("nb-NO", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const paidTotal = c.bookings
    .filter((b) => b.status === "completed")
    .reduce((a, b) => a + (Number(b.price_nok) || 0), 0);
  const contact = [c.phone, c.email, c.category].filter(Boolean).join("  ·  ");

  return (
    <Document title={`Kjøpshistorikk – ${c.full_name}`} author="Downtown Barbers">
      <Page size="A4" style={s.page}>
        {/* Merkevare-topp */}
        <View style={s.brandRow}>
          <View>
            <Text style={s.brand}>DOWNTOWN BARBERS</Text>
            <Text style={s.brandSub}>Kjøpshistorikk</Text>
          </View>
          <Text style={s.docType}>Generert {generated}</Text>
        </View>
        <View style={s.rule} />

        {/* Kunde */}
        <Text style={s.name}>{c.full_name}</Text>
        <Text style={s.metaLine}>Kunde siden {dt(c.created_at)}</Text>
        {contact.length > 0 && <Text style={s.metaLine}>{contact}</Text>}

        {/* Nøkkeltall */}
        <View style={s.statRow}>
          <Stat label="Besøk" value={String(c.visits)} />
          <Stat label="Totalt betalt" value={kr(paidTotal)} />
          <Stat label="Siste besøk" value={dt(c.lastVisit)} />
          <Stat label="Ikke møtt" value={String(c.noShows)} />
        </View>

        {/* Historikk */}
        <Text style={s.sectionTitle}>Booking- og kjøpshistorikk</Text>
        <View style={s.thead}>
          <Text style={[s.th, s.cDate]}>Dato</Text>
          <Text style={[s.th, s.cService]}>Tjeneste</Text>
          <Text style={[s.th, s.cBarber]}>Barber</Text>
          <Text style={[s.th, s.cStatus]}>Status</Text>
          <Text style={[s.th, s.cAmount]}>Beløp</Text>
        </View>
        {c.bookings.length === 0 ? (
          <View style={s.tr}>
            <Text style={s.muted}>Ingen bookinger registrert.</Text>
          </View>
        ) : (
          c.bookings.map((b) => {
            const off = b.status === "cancelled" || b.status === "no_show";
            return (
              <View style={s.tr} key={b.id} wrap={false}>
                <Text style={[s.cDate, off ? s.muted : undefined]}>{dt(b.start_at, true)}</Text>
                <Text style={s.cService}>{b.service}</Text>
                <Text style={[s.cBarber, s.muted]}>{b.barber}</Text>
                <Text style={[s.cStatus, s.muted]}>{STATUS[b.status] ?? b.status}</Text>
                <Text style={[s.cAmount, off ? s.muted : undefined]}>{off ? "—" : kr(b.price_nok)}</Text>
              </View>
            );
          })
        )}

        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Totalt betalt (fullførte)</Text>
          <Text style={s.totalValue}>{kr(paidTotal)}</Text>
        </View>

        {/* Bunntekst med sidetall */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Downtown Barbers · downtownbarbers.no</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Side ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** Rendrer kjøpshistorikk-PDF til en Buffer (Node runtime). */
export function renderPurchaseHistoryPdf(c: PurchaseHistoryData): Promise<Buffer> {
  return renderToBuffer(<PurchaseHistoryDoc c={c} />);
}
