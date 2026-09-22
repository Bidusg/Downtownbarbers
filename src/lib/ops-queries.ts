import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * Query-lag for admin-drift: lønn, gavekort, kasseoppgjør, fravær,
 * timelister, kampanjer og budsjett. Alt degraderer til tomt ved feil.
 * ===================================================================== */

export type StaffOption = { id: string; full_name: string; title: string | null };

export async function getStaffOptions(): Promise<StaffOption[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("staff")
      .select("id, full_name, title, active")
      .eq("active", true)
      .order("employee_number");
    return (data ?? []).map((r) => ({
      id: r.id as string,
      full_name: r.full_name as string,
      title: (r.title as string) ?? null,
    }));
  } catch {
    return [];
  }
}

/* ------------------------------- LØNN ------------------------------- */
// Modell (bekreftet med Kidus): grunnlønn + provisjon på eks-mva-omsetning.
export const PAYROLL = {
  BASE_NOK: 27000, // fast grunnlønn per barber/mnd
  THRESHOLD_NOK: 72000, // budsjett-terskel (eks. mva)
  RATE: 0.4, // andel til barber over terskel
  MVA: 0.25, // norsk standardsats – sales.total_nok antas inkl. mva
} as const;

export type PayrollRow = {
  staffId: string;
  name: string;
  title: string | null;
  grossNok: number; // omsetning inkl. mva (sum sales.total_nok)
  netNok: number; // eks. mva
  commissionBaseNok: number; // maks(0, netto − terskel)
  commissionNok: number; // provisjon (40 %)
  baseNok: number; // grunnlønn
  totalNok: number; // total lønn
};

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, month, 1)).toISOString();
  return { start, end };
}

export async function getPayroll(
  year: number,
  month: number,
): Promise<PayrollRow[]> {
  try {
    const sb = await createClient();
    const staff = await getStaffOptions();
    const { start, end } = monthRange(year, month);
    const { data: sales } = await sb
      .from("sales")
      .select("staff_id, total_nok")
      .gte("sold_at", start)
      .lt("sold_at", end);

    const grossByStaff = new Map<string, number>();
    for (const s of sales ?? []) {
      if (!s.staff_id) continue;
      grossByStaff.set(
        s.staff_id as string,
        (grossByStaff.get(s.staff_id as string) ?? 0) + (Number(s.total_nok) || 0),
      );
    }

    return staff.map((st) => {
      const gross = grossByStaff.get(st.id) ?? 0;
      const net = gross / (1 + PAYROLL.MVA);
      const commissionBase = Math.max(0, net - PAYROLL.THRESHOLD_NOK);
      const commission = commissionBase * PAYROLL.RATE;
      return {
        staffId: st.id,
        name: st.full_name,
        title: st.title,
        grossNok: gross,
        netNok: net,
        commissionBaseNok: commissionBase,
        commissionNok: commission,
        baseNok: PAYROLL.BASE_NOK,
        totalNok: PAYROLL.BASE_NOK + commission,
      };
    });
  } catch {
    return [];
  }
}

/* ----------------------------- GAVEKORT ----------------------------- */
export type GiftCard = {
  id: string;
  code: string;
  initial_nok: number;
  balance_nok: number;
  created_at: string;
  expires_at: string | null;
  barcode: string | null;
};

export async function getGiftCards(): Promise<GiftCard[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("gift_cards")
      .select("id, code, initial_nok, balance_nok, created_at, expires_at, barcode")
      .order("created_at", { ascending: false });
    return (data as GiftCard[]) ?? [];
  } catch {
    return [];
  }
}

/* --------------------------- KASSEOPPGJØR --------------------------- */
export type MethodBreakdown = { cash: number; card: number; vipps: number };

export type CashSettlement = {
  id: string;
  settle_date: string;
  total_nok: number;
  note: string | null;
  created_at: string;
  // Avstemming (0046) – null på gamle rader uten avstemming.
  counted_cash: number | null;
  counted_card: number | null;
  counted_vipps: number | null;
  expected_cash: number | null;
  expected_card: number | null;
  expected_vipps: number | null;
};

export async function getCashSettlements(): Promise<CashSettlement[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("cash_settlements")
      .select(
        "id, settle_date, total_nok, note, created_at, counted_cash, counted_card, counted_vipps, expected_cash, expected_card, expected_vipps",
      )
      .order("settle_date", { ascending: false })
      .limit(180);
    return (data as CashSettlement[]) ?? [];
  } catch {
    return [];
  }
}

/** Betalingsmåte → bøtte (kontant/kort/vipps). Ukjente havner utenfor. */
function methodBucket(m: string): keyof MethodBreakdown | null {
  const s = (m ?? "").trim().toLowerCase();
  if (s === "kontant" || s === "cash") return "cash";
  if (s === "kort" || s === "card") return "card";
  if (s === "vipps") return "vipps";
  return null;
}

/**
 * Forventet salg per betalingsmåte for en dato – grunnlaget kassen skal
 * avstemmes mot. Samme dagsvindu som getSalesTotalForDate.
 */
export async function getExpectedByMethodForDate(
  isoDate: string,
): Promise<MethodBreakdown> {
  const empty: MethodBreakdown = { cash: 0, card: 0, vipps: 0 };
  try {
    const sb = await createClient();
    const start = new Date(`${isoDate}T00:00:00.000Z`).toISOString();
    const end = new Date(`${isoDate}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const { data } = await sb
      .from("sales")
      .select("id, total_nok, payment_method")
      .gte("sold_at", start)
      .lt("sold_at", end.toISOString());
    const rows = (data ?? []) as {
      id: string;
      total_nok: number;
      payment_method: string | null;
    }[];

    // Splittbetalinger ligger i sale_payments – autoritativ per måte. Salg uten
    // slike rader (gamle salg, hurtigsalg) bøttes på sales.payment_method.
    const ids = rows.map((s) => s.id);
    const bySale = new Map<string, { method: string; amount: number }[]>();
    if (ids.length > 0) {
      const { data: pays } = await sb
        .from("sale_payments")
        .select("sale_id, method, amount")
        .in("sale_id", ids);
      for (const p of (pays ?? []) as {
        sale_id: string;
        method: string;
        amount: number;
      }[]) {
        const list = bySale.get(p.sale_id) ?? [];
        list.push({ method: p.method, amount: Number(p.amount) || 0 });
        bySale.set(p.sale_id, list);
      }
    }

    const res = { ...empty };
    for (const s of rows) {
      const plist = bySale.get(s.id);
      if (plist && plist.length > 0) {
        for (const p of plist) {
          const b = methodBucket(p.method);
          if (b) res[b] += p.amount;
        }
      } else {
        const b = methodBucket(s.payment_method as string);
        if (b) res[b] += Number(s.total_nok) || 0;
      }
    }
    res.cash = Math.round(res.cash);
    res.card = Math.round(res.card);
    res.vipps = Math.round(res.vipps);
    return res;
  } catch {
    return empty;
  }
}

/** Registrert salg (inkl. mva) for en gitt dato – referanse ved oppgjør. */
export async function getSalesTotalForDate(isoDate: string): Promise<number> {
  try {
    const sb = await createClient();
    const start = new Date(`${isoDate}T00:00:00.000Z`).toISOString();
    const end = new Date(`${isoDate}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const { data } = await sb
      .from("sales")
      .select("total_nok")
      .gte("sold_at", start)
      .lt("sold_at", end.toISOString());
    return (data ?? []).reduce((s, r) => s + (Number(r.total_nok) || 0), 0);
  } catch {
    return 0;
  }
}

/** Sum rabatt gitt for en gitt dato – synliggjøres i kasseoppgjøret. */
export async function getDiscountTotalForDate(isoDate: string): Promise<number> {
  try {
    const sb = await createClient();
    const start = new Date(`${isoDate}T00:00:00.000Z`).toISOString();
    const end = new Date(`${isoDate}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const { data } = await sb
      .from("sales")
      .select("discount_nok")
      .gte("sold_at", start)
      .lt("sold_at", end.toISOString());
    return Math.round(
      (data ?? []).reduce((s, r) => s + (Number(r.discount_nok) || 0), 0),
    );
  } catch {
    return 0;
  }
}

/* ---------------------- DAG-FOR-DAG AVSTEMMING ---------------------- */

export type DailyReconRow = {
  /** UTC-dagsnøkkel yyyy-mm-dd (samme dagsvindu som getExpectedByMethodForDate). */
  date: string;
  expected: MethodBreakdown;
  /** Talt beløp fra dagsoppgjøret, eller null hvis dagen ikke er avstemt. */
  counted: MethodBreakdown | null;
  note: string | null;
  settled: boolean;
};

const chunk = <T>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/**
 * Dag-for-dag avstemming: for hver dag i vinduet [endDate − (days−1), endDate]
 * gir vi forventet salg per betalingsmåte (fra salget, splitt-bevisst – samme
 * grunnlag som selve oppgjøret) og talt beløp fra dagsoppgjøret om det finnes.
 * Avviket regnes ut ved visning. Nyeste dag først; dager helt uten salg OG uten
 * oppgjør utelates. Defensivt: tom liste ved feil.
 */
export async function getDailyReconciliation(
  endDate: string,
  days: number,
): Promise<DailyReconRow[]> {
  try {
    const sb = await createClient();
    const endD = new Date(`${endDate}T00:00:00.000Z`);
    const startD = new Date(endD);
    startD.setUTCDate(startD.getUTCDate() - (days - 1));
    const endExclusive = new Date(endD);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    const startKey = startD.toISOString().slice(0, 10);

    // Salg i vinduet.
    const { data: sales } = await sb
      .from("sales")
      .select("id, sold_at, total_nok, payment_method")
      .gte("sold_at", startD.toISOString())
      .lt("sold_at", endExclusive.toISOString())
      .limit(100000);
    const salesRows = (sales ?? []) as {
      id: string;
      sold_at: string;
      total_nok: number;
      payment_method: string | null;
    }[];

    // Splittbetalinger (autoritativ per måte) – hentet i sider for å unngå
    // for lange spørringer.
    const bySale = new Map<string, { method: string; amount: number }[]>();
    for (const ids of chunk(salesRows.map((s) => s.id), 500)) {
      const { data: pays } = await sb
        .from("sale_payments")
        .select("sale_id, method, amount")
        .in("sale_id", ids);
      for (const p of (pays ?? []) as {
        sale_id: string;
        method: string;
        amount: number;
      }[]) {
        const l = bySale.get(p.sale_id) ?? [];
        l.push({ method: p.method, amount: Number(p.amount) || 0 });
        bySale.set(p.sale_id, l);
      }
    }

    // Forventet per dag.
    const expByDay = new Map<string, MethodBreakdown>();
    for (const s of salesRows) {
      const key = new Date(s.sold_at).toISOString().slice(0, 10);
      const acc = expByDay.get(key) ?? { cash: 0, card: 0, vipps: 0 };
      const plist = bySale.get(s.id);
      if (plist && plist.length > 0) {
        for (const p of plist) {
          const b = methodBucket(p.method);
          if (b) acc[b] += p.amount;
        }
      } else {
        const b = methodBucket(s.payment_method as string);
        if (b) acc[b] += Number(s.total_nok) || 0;
      }
      expByDay.set(key, acc);
    }

    // Oppgjør i vinduet.
    const { data: setts } = await sb
      .from("cash_settlements")
      .select("settle_date, counted_cash, counted_card, counted_vipps, note")
      .gte("settle_date", startKey)
      .lte("settle_date", endDate);
    const settByDay = new Map<
      string,
      { counted: MethodBreakdown; note: string | null }
    >();
    for (const s of (setts ?? []) as {
      settle_date: string;
      counted_cash: number | null;
      counted_card: number | null;
      counted_vipps: number | null;
      note: string | null;
    }[]) {
      settByDay.set(s.settle_date, {
        counted: {
          cash: Number(s.counted_cash ?? 0),
          card: Number(s.counted_card ?? 0),
          vipps: Number(s.counted_vipps ?? 0),
        },
        note: s.note ?? null,
      });
    }

    const rows: DailyReconRow[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(endD);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const exp = expByDay.get(key);
      const st = settByDay.get(key);
      if (!exp && !st) continue;
      const expected = exp
        ? {
            cash: Math.round(exp.cash),
            card: Math.round(exp.card),
            vipps: Math.round(exp.vipps),
          }
        : { cash: 0, card: 0, vipps: 0 };
      rows.push({
        date: key,
        expected,
        counted: st ? st.counted : null,
        note: st?.note ?? null,
        settled: !!st,
      });
    }
    return rows;
  } catch {
    return [];
  }
}

/* ------------------------------ FRAVÆR ------------------------------ */
export type Absence = {
  id: string;
  staff_id: string;
  staffName: string;
  from_date: string;
  to_date: string;
  reason: string | null;
};

export async function getAbsences(): Promise<Absence[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("absences")
      .select("id, staff_id, from_date, to_date, reason, staff(full_name)")
      .order("from_date", { ascending: false });
    return (data ?? []).map((r) => {
      const st = r.staff as { full_name?: string } | null;
      return {
        id: r.id as string,
        staff_id: r.staff_id as string,
        staffName: st?.full_name ?? "—",
        from_date: r.from_date as string,
        to_date: r.to_date as string,
        reason: (r.reason as string) ?? null,
      };
    });
  } catch {
    return [];
  }
}

/* ---------------------------- TIMELISTER ---------------------------- */
export type StaffHour = {
  id: string;
  staff_id: string;
  staffName: string;
  weekday: number; // 0 = søndag
  start_time: string;
  end_time: string;
  week_parity: number; // 0 = hver uke, 1 = uke A, 2 = uke B
};

export const WEEKDAYS = [
  "Søndag",
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
];

export async function getStaffHours(): Promise<StaffHour[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("staff_hours")
      .select("id, staff_id, weekday, start_time, end_time, week_parity, staff(full_name)")
      .order("weekday");
    return (data ?? []).map((r) => {
      const st = r.staff as { full_name?: string } | null;
      return {
        id: r.id as string,
        staff_id: r.staff_id as string,
        staffName: st?.full_name ?? "—",
        weekday: Number(r.weekday),
        start_time: (r.start_time as string).slice(0, 5),
        end_time: (r.end_time as string).slice(0, 5),
        week_parity: Number(r.week_parity ?? 0),
      };
    });
  } catch {
    return [];
  }
}

export type TurnusRotation = { weeks: number; currentIndex: number };

/** Rotasjons-config: antall uker (N) + hvilken uke-indeks (1..N) som gjelder nå. */
export async function getTurnusRotation(): Promise<TurnusRotation> {
  try {
    const sb = await createClient();
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/Oslo",
    });
    const [cfg, idx] = await Promise.all([
      sb.from("settings").select("value").eq("key", "turnus_rotation").maybeSingle(),
      sb.rpc("turnus_week_parity", { p_date: today }),
    ]);
    const raw = Number((cfg.data?.value as { weeks?: number })?.weeks);
    const weeks = Number.isFinite(raw) && raw >= 1 && raw <= 6 ? Math.floor(raw) : 2;
    const currentIndex = Number(idx.data) || 1;
    return { weeks, currentIndex };
  } catch {
    return { weeks: 2, currentIndex: 1 };
  }
}

/** A/B-anker: er en PARTALLS ISO-uke «Uke A»? (default ja) */
export async function getTurnusAnchor(): Promise<{ aIsEven: boolean }> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("settings")
      .select("value")
      .eq("key", "turnus_anchor")
      .maybeSingle();
    const v = (data?.value ?? {}) as { a_is_even?: boolean };
    return { aIsEven: v.a_is_even !== false };
  } catch {
    return { aIsEven: true };
  }
}

/* ---------------------------- KAMPANJER ----------------------------- */
export type Campaign = {
  id: string;
  name: string;
  channel: string;
  body: string | null;
  scheduled_at: string | null;
  created_at: string;
};

export async function getCampaigns(): Promise<Campaign[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("campaigns")
      .select("id, name, channel, body, scheduled_at, created_at")
      .order("created_at", { ascending: false });
    return (data as Campaign[]) ?? [];
  } catch {
    return [];
  }
}

/* ----------------------------- BUDSJETT ----------------------------- */
export type Budget = {
  id: string;
  staff_id: string | null;
  staffName: string;
  year: number;
  month: number;
  target_nok: number;
};

export async function getBudgets(
  year: number,
  month: number,
): Promise<Budget[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("budgets")
      .select("id, staff_id, year, month, target_nok, staff(full_name)")
      .eq("year", year)
      .eq("month", month)
      .order("target_nok", { ascending: false });
    return (data ?? []).map((r) => {
      const st = r.staff as { full_name?: string } | null;
      return {
        id: r.id as string,
        staff_id: (r.staff_id as string) ?? null,
        staffName: st?.full_name ?? "—",
        year: Number(r.year),
        month: Number(r.month),
        target_nok: Number(r.target_nok) || 0,
      };
    });
  } catch {
    return [];
  }
}

/* ---------------- Avvik/fravær per dato (0028) ---------------- */

export type StaffException = {
  id: string;
  staff_id: string;
  staffName: string;
  date: string; // YYYY-MM-DD
  kind: "off" | "extra";
  start_time: string | null; // HH:MM, null = hele dagen (for 'off')
  end_time: string | null;
  note: string | null;
};

export type BookingBlock = {
  id: string;
  date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM, null = hele dagen
  end_time: string | null;
  reason: string | null;
};

/** Kommende booking-blokkeringer (admin sperrer tid for alle ansatte). */
export async function getBookingBlocks(): Promise<BookingBlock[]> {
  try {
    const sb = await createClient();
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/Oslo",
    });
    const { data } = await sb
      .from("booking_blocks")
      .select("id, block_date, start_time, end_time, reason")
      .gte("block_date", today)
      .order("block_date");
    return (data ?? []).map((r) => {
      const t = (v: unknown) => (v ? String(v).slice(0, 5) : null);
      return {
        id: r.id as string,
        date: r.block_date as string,
        start_time: t(r.start_time),
        end_time: t(r.end_time),
        reason: (r.reason as string) ?? null,
      };
    });
  } catch {
    return [];
  }
}

/** Kommende avvik (fra og med i dag), sortert på dato. */
export async function getStaffExceptions(): Promise<StaffException[]> {
  try {
    const sb = await createClient();
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/Oslo",
    }); // YYYY-MM-DD i Oslo-tid
    const { data } = await sb
      .from("staff_exceptions")
      .select("id, staff_id, date, kind, start_time, end_time, note, staff(full_name)")
      .gte("date", today)
      .order("date");
    return (data ?? []).map((r) => {
      const st = r.staff as { full_name?: string } | null;
      const t = (v: unknown) => (v ? String(v).slice(0, 5) : null);
      return {
        id: r.id as string,
        staff_id: r.staff_id as string,
        staffName: st?.full_name ?? "—",
        date: r.date as string,
        kind: (r.kind as "off" | "extra") ?? "off",
        start_time: t(r.start_time),
        end_time: t(r.end_time),
        note: (r.note as string) ?? null,
      };
    });
  } catch {
    return [];
  }
}

export type LeaveRequestAdmin = {
  id: string;
  staff_id: string;
  staffName: string;
  from_date: string;
  to_date: string;
  kind: string;
  note: string | null;
  status: "pending" | "approved" | "declined";
  created_at: string;
};

/** Fravaerssøknader fra ansatte (0035). Admin ser alle via RLS (is_admin). */
export async function getLeaveRequests(): Promise<LeaveRequestAdmin[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("leave_requests")
      .select(
        "id, staff_id, from_date, to_date, kind, note, status, created_at, staff(full_name)",
      )
      .order("status") // pending < approved < declined? nei – sorter i UI
      .order("created_at", { ascending: false });
    return (data ?? []).map((r) => {
      const st = r.staff as { full_name?: string } | null;
      return {
        id: r.id as string,
        staff_id: r.staff_id as string,
        staffName: st?.full_name ?? "—",
        from_date: r.from_date as string,
        to_date: r.to_date as string,
        kind: r.kind as string,
        note: (r.note as string) ?? null,
        status: r.status as "pending" | "approved" | "declined",
        created_at: r.created_at as string,
      };
    });
  } catch {
    return [];
  }
}
