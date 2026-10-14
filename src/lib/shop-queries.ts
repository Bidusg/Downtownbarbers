import { createClient } from "@/lib/supabase/server";
import { isAddonCategory } from "@/lib/service-categories";

export type ShopBarber = { id: string; full_name: string; display_name?: string | null };
export type ShopService = {
  name: string;
  duration_min: number;
  /** Kategorinavn (f.eks. Klipp, Skjegg, Tillegg). Brukes til gruppering i kassa. */
  category?: string;
};


export async function getBarbers(): Promise<ShopBarber[]> {
  try {
    const sb = await createClient();
    const first = await sb
      .from("staff")
      .select("id, full_name, display_name")
      .eq("active", true)
      .order("full_name");
    if (!first.error) return (first.data as ShopBarber[]) ?? [];
    const { data } = await sb.from("staff").select("id, full_name").eq("active", true).order("full_name");
    return (data as ShopBarber[]) ?? [];
  } catch {
    return [];
  }
}

export async function getServices(): Promise<ShopService[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("services")
      .select("name, duration_min, sort_order, service_categories(name, sort_order)")
      .eq("active", true);
    const rows = ((data ?? []) as unknown as {
      name: string;
      duration_min: number;
      sort_order: number | null;
      service_categories: { name?: string; sort_order?: number } | null;
    }[]).map((r) => ({
      name: r.name,
      duration_min: Number(r.duration_min) || 30,
      category: r.service_categories?.name ?? "Annet",
      catSort: r.service_categories?.sort_order ?? 0,
      svcSort: r.sort_order ?? 0,
    }));
    // Kategori-rekkefølge som på forsiden; «Tillegg» alltid sist.
    rows.sort(
      (a, b) =>
        Number(isAddonCategory(a.category)) - Number(isAddonCategory(b.category)) ||
        a.catSort - b.catSort ||
        a.category.localeCompare(b.category) ||
        a.svcSort - b.svcSort ||
        a.name.localeCompare(b.name),
    );
    return rows.map(({ name, duration_min, category }) => ({ name, duration_min, category }));
  } catch {
    return [];
  }
}

export type AgendaAddon = { name: string; price: number };

export type AgendaBooking = {
  id: string;
  staff_id: string | null;
  barber: string | null;
  start_at: string;
  end_at: string;
  status: string;
  customer: string | null;
  service: string | null;
  phone: string | null;
  customer_id: string | null;
  email: string | null;
  // Handlekurv-booking (tillegg + gruppe). Fylles på etter dagsagendaen.
  group_id?: string | null;
  person_label?: string | null;
  addons?: AgendaAddon[];
  notes?: string | null; // kundens notat fra bookingen
  group_size?: number; // antall bookinger i samme gruppe (1 = vanlig booking)
};

export async function getDayAgenda(date: string): Promise<AgendaBooking[]> {
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("day_agenda", { p_date: date });
    const agenda = (data as AgendaBooking[]) ?? [];
    if (agenda.length === 0) return agenda;

    const ids = agenda.map((b) => b.id);

    // Gruppe/person-merkelapp + tillegg hentes separat (admin/shop har RLS).
    const [{ data: meta }, { data: addons }] = await Promise.all([
      sb.from("bookings").select("id, group_id, person_label, notes").in("id", ids),
      sb
        .from("booking_addons")
        .select("booking_id, name, price_nok")
        .in("booking_id", ids)
        .order("created_at"),
    ]);

    const metaById = new Map(
      (meta ?? []).map((m) => [
        m.id as string,
        {
          group_id: (m.group_id as string | null) ?? null,
          person_label: (m.person_label as string | null) ?? null,
          notes: (m.notes as string | null) ?? null,
        },
      ]),
    );
    // Gruppe-størrelse: en «gruppe» på én booking er bare en vanlig booking.
    const groupCount = new Map<string, number>();
    for (const m of meta ?? []) {
      const g = m.group_id as string | null;
      if (g) groupCount.set(g, (groupCount.get(g) ?? 0) + 1);
    }
    const addonsById = new Map<string, AgendaAddon[]>();
    for (const a of addons ?? []) {
      const key = a.booking_id as string;
      const list = addonsById.get(key) ?? [];
      list.push({ name: a.name as string, price: Number(a.price_nok) || 0 });
      addonsById.set(key, list);
    }

    return agenda.map((b) => ({
      ...b,
      group_id: metaById.get(b.id)?.group_id ?? null,
      person_label: metaById.get(b.id)?.person_label ?? null,
      notes: metaById.get(b.id)?.notes ?? null,
      group_size: groupCount.get(metaById.get(b.id)?.group_id ?? "") ?? 1,
      addons: addonsById.get(b.id) ?? [],
    }));
  } catch {
    return [];
  }
}

/**
 * Barbere på vakt en gitt dag (navn). Regel: turnus (staff_hours) for ukedagen
 * ELLER konkret vakt (shifts, ikke fri) den datoen, minus fravær og «fri»-vakter.
 * Returnerer null når ingen har turnus/vakter i det hele tatt – da viser
 * kalenderen alle aktive barbere som før.
 */
export async function getBarbersOnDuty(date: string): Promise<string[] | null> {
  try {
    const sb = await createClient();
    // Samme regler som ledigheten i booking (turnus inkl. uke A/B, ekstravakt,
    // fravær, heldags fri). Ingen turnus = ikke på vakt.
    const { data, error } = await sb.rpc("staff_on_duty", { p_date: date });
    if (error || !Array.isArray(data)) return null; // før SQL er kjørt: vis alle
    return (data as unknown[]).map((x) =>
      typeof x === "string" ? x : String((x as Record<string, unknown>).staff_on_duty ?? ""),
    );
  } catch {
    return null;
  }
}


/**
 * Hvorfor er en barber IKKE på vakt en gitt dag? (navn → kort forklaring)
 * Brukes under kalenderen så ingen «forsvinner» uforklart.
 */
export async function getOffDutyReasons(date: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const sb = await createClient();
    const fmt = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`;
    const [abs, exc] = await Promise.all([
      sb
        .from("absences")
        .select("from_date, to_date, reason, staff(full_name)")
        .lte("from_date", date)
        .gte("to_date", date),
      sb
        .from("staff_exceptions")
        .select("kind, start_time, note, staff(full_name)")
        .eq("date", date)
        .eq("kind", "off")
        .is("start_time", null),
    ]);
    for (const a of abs.data ?? []) {
      const n = (a.staff as { full_name?: string } | null)?.full_name;
      if (!n) continue;
      const why = (a.reason as string | null)?.trim();
      out[n] = `fravær ${fmt(a.from_date as string)}–${fmt(a.to_date as string)}${why ? ` (${why})` : ""}`;
    }
    for (const e of exc.data ?? []) {
      const n = (e.staff as { full_name?: string } | null)?.full_name;
      if (!n || out[n]) continue;
      const why = (e.note as string | null)?.trim();
      out[n] = `fri denne dagen${why ? ` (${why})` : ""}`;
    }
  } catch {
    // ingen forklaringer
  }
  return out;
}

/* ---------------- Arbeidstid per barber (til kalender-skyggelegging) ---------------- */

export type ShiftBlock = { start: number; end: number; kind: "turnus" | "vakt" };

export type DaySchedule = {
  /** Butikkens åpningstid denne ukedagen i minutter etter midnatt (null = stengt / ukjent). */
  shopOpen: number | null;
  shopClose: number | null;
  /** Barbernavn → arbeidsblokker denne dagen (tom liste = ikke på jobb). */
  shifts: Record<string, ShiftBlock[]>;
};

const toMin = (t: string | null | undefined): number | null => {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

/** Trekk et tidsrom fra en liste med blokker. */
function subtract(blocks: ShiftBlock[], s: number, e: number): ShiftBlock[] {
  const out: ShiftBlock[] = [];
  for (const b of blocks) {
    if (e <= b.start || s >= b.end) {
      out.push(b);
      continue;
    }
    if (s > b.start) out.push({ ...b, end: s });
    if (e < b.end) out.push({ ...b, start: e });
  }
  return out;
}

/**
 * Når jobber hver barber en gitt dag? Samme regler som bookingen:
 *  - turnus (ukedag, uke A/B, gyldig fra/til)
 *  - «Vakt denne dagen» erstatter turnusen den dagen
 *  - fravær / fri hele dagen = ingen arbeidstid (med mindre det er satt vakt)
 *  - delvis fri trekkes fra
 * Leses med service-rollen (kun visning; shop har ikke lesetilgang til turnus).
 * Feiler stille → null (kalenderen viser da som før, uten skyggelegging).
 */
export async function getDaySchedule(date: string): Promise<DaySchedule | null> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const { getSiteSettings } = await import("@/lib/site-settings");
    const sb = createServiceClient();
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();

    const [settings, parityRes, staffRes, hoursRes, excRes, absRes] = await Promise.all([
      getSiteSettings(),
      sb.rpc("turnus_week_parity", { p_date: date }),
      sb.from("staff").select("id, full_name").eq("active", true),
      sb
        .from("staff_hours")
        .select("staff_id, weekday, start_time, end_time, week_parity, valid_from, valid_to")
        .eq("weekday", dow),
      sb.from("staff_exceptions").select("staff_id, kind, start_time, end_time").eq("date", date),
      sb.from("absences").select("staff_id").lte("from_date", date).gte("to_date", date),
    ]);
    if (staffRes.error || hoursRes.error) return null;

    const day = settings.hours?.[String(dow)] ?? null;
    const shopOpen = day ? toMin(day.open) : null;
    const shopClose = day ? toMin(day.close) : null;
    const parity = typeof parityRes.data === "number" ? parityRes.data : null;

    const shifts: Record<string, ShiftBlock[]> = {};
    const exc = (excRes.data ?? []) as {
      staff_id: string;
      kind: string;
      start_time: string | null;
      end_time: string | null;
    }[];
    const absent = new Set(((absRes.data ?? []) as { staff_id: string }[]).map((a) => a.staff_id));

    for (const st of (staffRes.data ?? []) as { id: string; full_name: string }[]) {
      const mine = exc.filter((e) => e.staff_id === st.id);
      const extra = mine.filter((e) => e.kind === "extra" && e.start_time && e.end_time);
      let blocks: ShiftBlock[];
      if (extra.length > 0) {
        blocks = extra.map((e) => ({ start: toMin(e.start_time)!, end: toMin(e.end_time)!, kind: "vakt" as const }));
      } else {
        const fullOff = mine.some((e) => e.kind === "off" && !e.start_time);
        if (fullOff || absent.has(st.id)) {
          blocks = [];
        } else {
          blocks = ((hoursRes.data ?? []) as {
            staff_id: string;
            start_time: string;
            end_time: string;
            week_parity: number | null;
            valid_from: string | null;
            valid_to: string | null;
          }[])
            .filter(
              (h) =>
                h.staff_id === st.id &&
                (h.week_parity == null || h.week_parity === 0 || parity == null || h.week_parity === parity) &&
                (!h.valid_from || h.valid_from <= date) &&
                (!h.valid_to || h.valid_to >= date),
            )
            .map((h) => ({ start: toMin(h.start_time)!, end: toMin(h.end_time)!, kind: "turnus" as const }));
        }
      }
      for (const e of mine) {
        if (e.kind === "off" && e.start_time && e.end_time) {
          blocks = subtract(blocks, toMin(e.start_time)!, toMin(e.end_time)!);
        }
      }
      shifts[st.full_name] = blocks
        .filter((b) => b.end > b.start)
        .sort((a, b) => a.start - b.start);
    }
    return { shopOpen, shopClose, shifts };
  } catch {
    return null;
  }
}
