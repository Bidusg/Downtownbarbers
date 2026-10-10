import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * Kunde-filter: finn kunder etter hvilken barber som har klippet dem,
 * markedsføringssamtykke, siste besøk og forbruk. Flere filtre kombineres
 * med OG (alle må stemme). «Klippet av barber» = union av bookinger +
 * salg + customer_barbers (historikk importert fra Fixit).
 *
 * Alt degraderer trygt til tomt ved feil (samme mønster som dm-queries).
 * ===================================================================== */

export type BarberOption = { id: string; name: string; active: boolean };

/** Alle barbere – OGSÅ inaktive (vi vil kunne filtrere på f.eks. Vani som
 *  nettopp sluttet). Aktive først, så inaktive. */
export async function getFilterBarbers(): Promise<BarberOption[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("staff")
      .select("id, full_name, active")
      .order("active", { ascending: false })
      .order("full_name");
    return ((data ?? []) as { id: string; full_name: string; active: boolean }[]).map(
      (s) => ({ id: s.id, name: s.full_name, active: !!s.active }),
    );
  } catch {
    return [];
  }
}

export type CustomerFilter = {
  /** staff.id – vis kun kunder denne barberen har klippet. */
  barberId?: string | null;
  /** "yes" = kun med samtykke, "no" = kun uten, undefined = begge. */
  consent?: "yes" | "no" | null;
  /** Kun kunder som IKKE har besøkt på minst så mange dager (inaktive). */
  notVisitedDays?: number | null;
  /** Kun kunder som har brukt minst så mye (kr, totalt). */
  minSpent?: number | null;
};

export type CustomerFilterRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  consent: boolean;
  lastVisit: string | null; // yyyy-mm-dd
  spent: number;
};

export async function filterCustomers(
  f: CustomerFilter,
): Promise<CustomerFilterRow[]> {
  try {
    const sb = await createClient();

    // 1) Alle kunder (paginert – PostgREST gir maks 1000 per kall).
    type Cust = {
      id: string;
      full_name: string;
      phone: string | null;
      email: string | null;
      marketing_consent: boolean | null;
    };
    const customers: Cust[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await sb
        .from("customers")
        .select("id, full_name, phone, email, marketing_consent")
        .order("id")
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      customers.push(...(data as Cust[]));
      if (data.length < 1000) break;
    }
    if (customers.length === 0) return [];

    // 2) «Klippet av barber» → sett med kunde-id-er (union av tre kilder).
    let servedSet: Set<string> | null = null;
    if (f.barberId) {
      servedSet = new Set<string>();
      const [bk, sl, cb] = await Promise.all([
        sb
          .from("bookings")
          .select("customer_id")
          .eq("staff_id", f.barberId)
          .neq("status", "cancelled")
          .not("customer_id", "is", null)
          .limit(100000),
        sb
          .from("sales")
          .select("customer_id")
          .eq("staff_id", f.barberId)
          .not("customer_id", "is", null)
          .limit(100000),
        sb
          .from("customer_barbers")
          .select("customer_id")
          .eq("staff_id", f.barberId)
          .limit(100000),
      ]);
      for (const r of (bk.data ?? []) as { customer_id: string }[])
        servedSet.add(r.customer_id);
      for (const r of (sl.data ?? []) as { customer_id: string }[])
        servedSet.add(r.customer_id);
      for (const r of (cb.data ?? []) as { customer_id: string }[])
        servedSet.add(r.customer_id);
    }

    // 3) Siste besøk per kunde (fullførte bookinger + importert last_visit).
    const lastVisit = new Map<string, number>();
    const bumpVisit = (cid: string, t: number) => {
      if (!lastVisit.has(cid) || t > (lastVisit.get(cid) as number))
        lastVisit.set(cid, t);
    };
    // 4) Forbruk per kunde (salg + importert total_spent).
    const spend = new Map<string, number>();
    const addSpend = (cid: string, n: number) =>
      spend.set(cid, (spend.get(cid) ?? 0) + n);

    const needVisit = f.notVisitedDays != null;
    const needSpend = f.minSpent != null;

    const [compBk, salesAll, cbAll] = await Promise.all([
      needVisit
        ? sb
            .from("bookings")
            .select("customer_id, start_at")
            .eq("status", "completed")
            .not("customer_id", "is", null)
            .limit(100000)
        : Promise.resolve({ data: [] }),
      needSpend
        ? sb
            .from("sales")
            .select("customer_id, total_nok")
            .not("customer_id", "is", null)
            .limit(100000)
        : Promise.resolve({ data: [] }),
      needVisit || needSpend
        ? sb
            .from("customer_barbers")
            .select("customer_id, last_visit, total_spent")
            .limit(100000)
        : Promise.resolve({ data: [] }),
    ]);

    if (needVisit) {
      for (const b of (compBk.data ?? []) as {
        customer_id: string;
        start_at: string;
      }[]) {
        const t = new Date(b.start_at).getTime();
        if (Number.isFinite(t)) bumpVisit(b.customer_id, t);
      }
    }
    if (needSpend) {
      for (const s of (salesAll.data ?? []) as {
        customer_id: string;
        total_nok: number;
      }[])
        addSpend(s.customer_id, Number(s.total_nok) || 0);
    }
    for (const r of (cbAll.data ?? []) as {
      customer_id: string;
      last_visit: string | null;
      total_spent: number | null;
    }[]) {
      if (needVisit && r.last_visit) {
        const t = new Date(`${r.last_visit}T12:00:00Z`).getTime();
        if (Number.isFinite(t)) bumpVisit(r.customer_id, t);
      }
      if (needSpend && r.total_spent != null)
        addSpend(r.customer_id, Number(r.total_spent) || 0);
    }

    // 5) Bruk filtrene (alle med OG).
    const cutoff =
      f.notVisitedDays != null
        ? Date.now() - f.notVisitedDays * 86400000
        : null;

    const out: CustomerFilterRow[] = [];
    for (const c of customers) {
      if (servedSet && !servedSet.has(c.id)) continue;
      const consent = c.marketing_consent === true;
      if (f.consent === "yes" && !consent) continue;
      if (f.consent === "no" && consent) continue;

      const lv = lastVisit.get(c.id) ?? null;
      if (cutoff != null && (lv ?? 0) >= cutoff) continue; // har besøkt nylig → ut

      const sp = Math.round(spend.get(c.id) ?? 0);
      if (f.minSpent != null && sp < f.minSpent) continue;

      out.push({
        id: c.id,
        name: c.full_name ?? "",
        phone: c.phone ?? null,
        email: (c.email ?? "")?.trim() || null,
        consent,
        lastVisit: lv ? new Date(lv).toISOString().slice(0, 10) : null,
        spent: sp,
      });
    }
    // Sist besøkt nyligst først; ukjent sist.
    out.sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""));
    return out;
  } catch {
    return [];
  }
}
