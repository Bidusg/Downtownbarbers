/* =====================================================================
 * Felles visningsformat for back-office (klient- og server-trygg).
 * ===================================================================== */

/** 1250 → «1 250 kr» (avrundet, norsk tusenskille). */
export function formatKr(n: number | null | undefined): string {
  return `${Math.round(Number(n) || 0).toLocaleString("nb-NO")} kr`;
}

/** Betalingsmåte (db-nøkkel eller fritekst) → norsk etikett. */
export function methodLabel(m: string | null | undefined): string {
  const v = (m ?? "").toLowerCase().trim();
  if (!v) return "Ukjent";
  if (v.includes("cash") || v.includes("kontant")) return "Kontant";
  if (v.includes("card") || v.includes("kort") || v.includes("terminal")) return "Kort";
  if (v.includes("vipps")) return "Vipps";
  if (v.includes("gift") || v.includes("gave")) return "Gavekort";
  if (v.includes("split") || v.includes("delt")) return "Delt betaling";
  if (v.includes("invoice") || v.includes("faktura")) return "Faktura";
  if (v.includes("import")) return "Importert (gammelt system)";
  return m as string;
}

/** «2026-10-07» eller ISO-tid → «7. okt. 2026» (Oslo). */
export function formatDate(iso: string | null | undefined, opts?: { weekday?: boolean }): string {
  if (!iso) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T12:00:00Z") : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("nb-NO", {
    timeZone: "Europe/Oslo",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(opts?.weekday ? { weekday: "short" } : {}),
  });
}

/** Booking-status → norsk etikett. */
export function bookingStatusLabel(s: string | null | undefined): string {
  switch (s) {
    case "pending": return "Venter";
    case "confirmed": return "Bekreftet";
    case "completed": return "Fullført";
    case "cancelled": return "Avbestilt";
    case "no_show": return "Ikke møtt";
    default: return s ?? "—";
  }
}
