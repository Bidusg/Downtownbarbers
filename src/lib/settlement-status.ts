import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * Kasseoppgjør-tvang (løsning D): finn dager med salg som MANGLER et
 * BEKREFTET kasseoppgjør. Brukes av (a) den røde banneren i kasse/admin
 * og (b) den daglige påminnelses-e-posten.
 *
 * «Bekreftet» = rad i cash_settlements med confirmed = true. Auto-utkast
 * laget av cronen har confirmed = false og teller derfor som MANGLENDE
 * til et menneske har bekreftet opptellingen.
 *
 * Alt degraderer trygt (try/catch → tom liste), og fungerer også FØR
 * SQL-migrasjonen (confirmed-kolonnen) er kjørt: da finnes ingen
 * confirmed-kolonne, og vi faller tilbake til å regne enhver eksisterende
 * oppgjørsrad som bekreftet (dvs. banneren varsler kun dager helt uten
 * oppgjør). Ingenting krasjer.
 * ===================================================================== */

export type MissingSettlementDay = {
  /** UTC-dagsnøkkel yyyy-mm-dd (samme dagsvindu som ops-queries). */
  date: string;
  /** Registrert salg (inkl. mva) den dagen – til visning i banner/e-post. */
  salesTotal: number;
};

/** yyyy-mm-dd i Oslo-tid for «i dag». */
function osloToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
}

/**
 * Dager (t.o.m. GÅRSDAGEN, bakover `days` dager) som har registrert salg,
 * men IKKE et bekreftet kasseoppgjør. Dagens dato utelates bevisst – dagen
 * er ikke ferdig enda, så den skal ikke mases om. Nyeste manglende dag først.
 *
 * @param days Hvor langt bakover vi ser (default 14).
 * @param client Valgfri Supabase-klient. Server components/layout kan droppe
 *   den (bruker innlogget admin-sesjon via cookies). Cron-ruter må sende inn
 *   service-klienten (ingen sesjon → ellers blokkerer RLS lesingen).
 */
export async function getMissingSettlementDays(
  days = 14,
  client?: SupabaseClient,
): Promise<MissingSettlementDay[]> {
  try {
    const sb = client ?? (await createClient());

    const today = osloToday();
    // Siste ferdige dag = i går (Oslo). Vinduet er [yesterday-(days-1) … yesterday].
    const yesterday = new Date(`${today}T00:00:00.000Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const startD = new Date(yesterday);
    startD.setUTCDate(startD.getUTCDate() - (days - 1));

    const startIso = startD.toISOString();
    // Eksklusiv øvre grense = starten på dagens dato (slik at i dag utelates).
    const endExclusiveIso = `${today}T00:00:00.000Z`;
    const startKey = startD.toISOString().slice(0, 10);
    const endKey = yesterday.toISOString().slice(0, 10);

    // Salg i vinduet → hvilke dager hadde salg (+ sum til visning).
    const { data: sales } = await sb
      .from("sales")
      .select("sold_at, total_nok")
      .gte("sold_at", startIso)
      .lt("sold_at", endExclusiveIso)
      .limit(100000);

    const salesByDay = new Map<string, number>();
    for (const s of (sales ?? []) as { sold_at: string; total_nok: number }[]) {
      const key = new Date(s.sold_at).toISOString().slice(0, 10);
      salesByDay.set(key, (salesByDay.get(key) ?? 0) + (Number(s.total_nok) || 0));
    }
    if (salesByDay.size === 0) return [];

    // Bekreftede oppgjør i vinduet. Prøv med confirmed-kolonnen; faller
    // tilbake (SQL ikke kjørt) til å regne enhver rad som bekreftet.
    const confirmedDays = new Set<string>();
    const withConfirmed = await sb
      .from("cash_settlements")
      .select("settle_date, confirmed")
      .gte("settle_date", startKey)
      .lte("settle_date", endKey);

    if (withConfirmed.error) {
      const fb = await sb
        .from("cash_settlements")
        .select("settle_date")
        .gte("settle_date", startKey)
        .lte("settle_date", endKey);
      for (const r of (fb.data ?? []) as { settle_date: string }[]) {
        confirmedDays.add(r.settle_date);
      }
    } else {
      for (const r of (withConfirmed.data ?? []) as {
        settle_date: string;
        confirmed: boolean | null;
      }[]) {
        // confirmed er default true i DB; null (gammel rad) regnes som bekreftet.
        if (r.confirmed !== false) confirmedDays.add(r.settle_date);
      }
    }

    const out: MissingSettlementDay[] = [];
    for (const [date, salesTotal] of salesByDay) {
      if (!confirmedDays.has(date)) {
        out.push({ date, salesTotal: Math.round(salesTotal) });
      }
    }
    // Nyeste først.
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return out;
  } catch {
    return [];
  }
}
