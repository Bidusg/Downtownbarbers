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
  /** "yes" = kun med samtykke, "no" = kun uten, "unsub" = har meldt seg av, undefined = alle. */
  consent?: "yes" | "no" | "unsub" | null;
  /** Kun kunder som IKKE har besøkt på minst så mange dager (inaktive). */
  notVisitedDays?: number | null;
  /** Kun kunder som har brukt minst så mye (kr, totalt). */
  minSpent?: number | null;
  /** Fritekst-søk i navn, telefon og e-post. */
  q?: string | null;
};

export type CustomerFilterRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  consent: boolean;
  /** Når kunden meldte seg av / fikk samtykket fjernet (yyyy-mm-dd), ellers null. */
  unsubscribedAt: string | null;
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
      marketing_unsubscribed_at?: string | null;
    };
    const customers: Cust[] = [];
    // Avmeldt-kolonnen finnes først etter KJØR-I-SUPABASE-SAMTYKKE-LOGG.sql.
    let cols = "id, full_name, phone, email, marketing_consent, marketing_unsubscribed_at";
    for (let from = 0; ; from += 1000) {
      let { data, error } = await sb
        .from("customers")
        .select(cols)
        .order("id")
        .range(from, from + 999);
      if (error && from === 0 && /marketing_unsubscribed_at/.test(error.message)) {
        cols = "id, full_name, phone, email, marketing_consent";
        ({ data, error } = await sb.from("customers").select(cols).order("id").range(from, from + 999));
      }
      if (!data || data.length === 0) break;
      customers.push(...(data as unknown as Cust[]));
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

    // Søk: alle ordene må finnes i navn/e-post, eller sifrene i telefonen.
    const terms = (f.q ?? "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    const qDigits = (f.q ?? "").replace(/\D/g, "");
    const matchesQ = (c: Cust) => {
      if (!terms.length) return true;
      const hay = `${c.full_name ?? ""} ${c.email ?? ""}`.toLowerCase();
      if (terms.every((t) => hay.includes(t))) return true;
      return qDigits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(qDigits);
    };

    const out: CustomerFilterRow[] = [];
    for (const c of customers) {
      if (servedSet && !servedSet.has(c.id)) continue;
      if (!matchesQ(c)) continue;
      const consent = c.marketing_consent === true;
      if (f.consent === "yes" && !consent) continue;
      if (f.consent === "no" && consent) continue;
      const unsub = !consent && c.marketing_unsubscribed_at ? c.marketing_unsubscribed_at.slice(0, 10) : null;
      if (f.consent === "unsub" && !unsub) continue;

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
        unsubscribedAt: unsub,
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


/**
 * Mottakere til en utsending fra et egendefinert filter (Markedsføring):
 * kun kunder med samtykke + e-post (eller mobil for SMS) + avmeldings-token.
 */
export async function getFilterRecipients(
  f: CustomerFilter,
  channel: "email" | "sms",
): Promise<{ id: string; name: string; email: string; phone: string | null; token: string | null }[]> {
  const rows = await filterCustomers({ ...f, consent: "yes" });
  const ids = rows
    .filter((r) => r.consent && (channel === "sms" ? r.phone?.trim() : r.email?.trim()))
    .map((r) => r.id);
  if (!ids.length) return [];
  const sb = await createClient();
  const out: { id: string; name: string; email: string; phone: string | null; token: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await sb
      .from("customers")
      .select("id, full_name, email, phone, portal_token")
      .in("id", ids.slice(i, i + 500));
    for (const c of (data ?? []) as {
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
      portal_token: string | null;
    }[]) {
      out.push({
        id: c.id,
        name: c.full_name ?? "",
        email: (c.email ?? "").trim(),
        phone: c.phone,
        token: c.portal_token,
      });
    }
  }
  return out;
}

/** Les et filter fra skjema-JSON (Markedsføring). Ukjente felt ignoreres. */
export function parseFilterJson(raw: string): CustomerFilter | null {
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
    return {
      barberId: typeof v.barberId === "string" && v.barberId ? v.barberId : null,
      notVisitedDays: num(v.notVisitedDays),
      minSpent: num(v.minSpent),
      q: typeof v.q === "string" ? v.q.slice(0, 100) : null,
      consent: "yes",
    };
  } catch {
    return null;
  }
}
