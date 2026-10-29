"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { postDailyVoucher } from "@/lib/tripletex/voucher";
import {
  getExpectedByMethodForDate,
  type MethodBreakdown,
} from "@/lib/ops-queries";

/* =====================================================================
 * Shop-kasseoppgjør: la kassa (shop) LEVERE dagens oppgjør.
 *
 * Bevisst smalt – shop kan levere (og bekrefte et auto-utkast), men ikke
 * rette/slette et allerede levert oppgjør (det håndheves både her og i
 * RLS, se KJØR-I-SUPABASE-SHOP-KASSEOPPGJOR.sql). Admin/eier beholder den
 * fulle siden under /admin/kasseoppgjor.
 * ===================================================================== */

function num(v: FormDataEntryValue | null): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

async function ensureShopOrAdmin(): Promise<boolean> {
  const me = await getUserRole();
  return !!me && (me.role === "shop" || isAdminRole(me.role));
}

export type DateSettlementInfo = {
  expected: MethodBreakdown;
  /** Allerede levert (bekreftet) oppgjør for datoen? */
  delivered: boolean;
  /** Talte beløp hvis levert (til kvitteringsvisning). */
  counted: MethodBreakdown | null;
  note: string | null;
  /** Oppgjørets id (for «Endre»). */
  id?: string | null;
  /** Kan rettes fra kassa (levert innen siste 7 dager, eller admin). */
  canEdit?: boolean;
  editCount?: number;
  editedAt?: string | null;
};

const EDIT_DAYS = 7;

function osloToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

/** Forventet + status for en dato (til live-oppdatering når shop bytter dag). */
export async function dateSettlementInfo(
  date: string,
): Promise<DateSettlementInfo> {
  const empty: DateSettlementInfo = {
    expected: { cash: 0, card: 0, vipps: 0 },
    delivered: false,
    counted: null,
    note: null,
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return empty;
  if (!(await ensureShopOrAdmin())) return empty;

  const expected = await getExpectedByMethodForDate(date);
  const sb = await createClient();

  // Finnes et BEKREFTET oppgjør for dagen? (confirmed-kolonnen kan mangle før
  // TVANG-SQL er kjørt → da teller enhver rad som levert.)
  const withConfirmed = await sb
    .from("cash_settlements")
    .select("id, counted_cash, counted_card, counted_vipps, note, confirmed")
    .eq("settle_date", date)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!withConfirmed.error && withConfirmed.data) {
    const row = withConfirmed.data as {
      id: string;
      counted_cash: number | null;
      counted_card: number | null;
      counted_vipps: number | null;
      note: string | null;
      confirmed: boolean | null;
    };
    if (row.confirmed !== false) {
      // Endringsinfo (kolonnene finnes etter KASSEOPPGJOR-ENDRE.sql).
      let editCount = 0;
      let editedAt: string | null = null;
      try {
        const { data: ed } = await sb
          .from("cash_settlements")
          .select("edit_count, edited_at")
          .eq("id", row.id)
          .maybeSingle();
        editCount = Number((ed as { edit_count?: number } | null)?.edit_count) || 0;
        editedAt = (ed as { edited_at?: string | null } | null)?.edited_at ?? null;
      } catch {
        /* SQL ikke kjørt ennå */
      }
      const me = await getUserRole();
      const admin = !!me && isAdminRole(me.role);
      return {
        id: row.id,
        canEdit: admin || daysBetween(date, osloToday()) <= EDIT_DAYS,
        editCount,
        editedAt,
        expected,
        delivered: true,
        counted: {
          cash: Number(row.counted_cash ?? 0),
          card: Number(row.counted_card ?? 0),
          vipps: Number(row.counted_vipps ?? 0),
        },
        note: row.note,
      };
    }
  }
  return { expected, delivered: false, counted: null, note: null };
}

/**
 * Lever (bekreft) dagens kasseoppgjør. Bekrefter et eventuelt auto-utkast fra
 * natt-cronen; ellers oppretter et nytt, bekreftet oppgjør. Nekter hvis dagen
 * allerede er levert (lever én gang).
 */
export async function deliverShopSettlement(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  if (!(await ensureShopOrAdmin())) return { error: "Ingen tilgang." };

  const settle_date = String(formData.get("settle_date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settle_date))
    return { error: "Velg en gyldig dato." };
  for (const f of ["counted_cash", "counted_card", "counted_vipps"]) {
    const raw = String(formData.get(f) ?? "").trim();
    if (raw !== "" && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) {
      return { error: "Talte beløp må være 0 eller mer." };
    }
  }


  // Vern mot tomt skjema: ingen talte felt fylt ut, men det finnes salg den
  // dagen → nesten alltid et feiltrykk (det var slik «0 kr (manko)»-radene
  // oppsto). Bevisst 0 må tastes inn som 0.
  {
    const anyFilled = ["counted_cash", "counted_card", "counted_vipps"].some(
      (f) => String(formData.get(f) ?? "").trim() !== "",
    );
    const exp = await getExpectedByMethodForDate(settle_date);
    if (!anyFilled && exp.cash + exp.card + exp.vipps > 0) {
      return { error: "Fyll inn talte beløp før du lagrer (skriv 0 hvis det faktisk er 0)." };
    }
  }

  const counted_cash = num(formData.get("counted_cash"));
  const counted_card = num(formData.get("counted_card"));
  const counted_vipps = num(formData.get("counted_vipps"));

  // Forventet regnes server-side (snapshot) – aldri fra klienten.
  const expected = await getExpectedByMethodForDate(settle_date);

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  const values = {
    total_nok: counted_cash + counted_card + counted_vipps,
    counted_cash,
    counted_card,
    counted_vipps,
    expected_cash: expected.cash,
    expected_card: expected.card,
    expected_vipps: expected.vipps,
    note: String(formData.get("note") ?? "") || null,
    opened_by: user?.id ?? null,
  };

  // Finnes allerede et oppgjør for dagen? Bekreftet → nekt (lever én gang).
  // Ubekreftet auto-utkast → bekreft DET (unngår dublett, fjerner banneren).
  try {
    const { data: existing } = await sb
      .from("cash_settlements")
      .select("id, confirmed")
      .eq("settle_date", settle_date)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const row = existing as { id: string; confirmed: boolean | null };
      if (row.confirmed !== false) {
        return { error: "Dagen er allerede levert. Kontakt admin for å rette." };
      }
      const { error: upErr } = await sb
        .from("cash_settlements")
        .update({ ...values, confirmed: true })
        .eq("id", row.id);
      if (upErr) return { error: `Kunne ikke lagre oppgjøret: ${upErr.message}` };
      revalidatePath("/kasse/kasseoppgjor");
      try {
        await postDailyVoucher(settle_date);
      } catch {
        /* oppgjøret er lagret; natt-cron er backup */
      }
      return { ok: true };
    }
  } catch {
    // confirmed-kolonnen finnes ikke enda → fall videre til vanlig insert.
  }

  const { error } = await sb
    .from("cash_settlements")
    .insert({ settle_date, ...values });
  if (error) return { error: `Kunne ikke lagre oppgjøret: ${error.message}` };
  revalidatePath("/kasse/kasseoppgjor");

  try {
    await postDailyVoucher(settle_date);
  } catch {
    /* kasseoppgjøret er lagret; natt-cron er backup */
  }
  return { ok: true };
}

/**
 * Rett et levert oppgjør. Krever begrunnelse; de gamle tallene tas vare på
 * i historikken (databasen). Kassa kan rette de siste 7 dagene, admin alle.
 */
export async function editShopSettlement(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  if (!(await ensureShopOrAdmin())) return { error: "Ingen tilgang." };
  const id = String(formData.get("id") ?? "").trim();
  const settle_date = String(formData.get("settle_date") ?? "");
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(settle_date)) return { error: "Ugyldig oppgjør." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "Skriv kort hvorfor oppgjøret endres." };
  for (const f of ["counted_cash", "counted_card", "counted_vipps"]) {
    const raw = String(formData.get(f) ?? "").trim();
    if (raw === "" || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
      return { error: "Fyll inn talte beløp (0 eller mer) i alle feltene." };
    }
  }
  const expected = await getExpectedByMethodForDate(settle_date);
  const sb = await createClient();
  const { error } = await sb.rpc("edit_cash_settlement", {
    p_id: id,
    p_cash: num(formData.get("counted_cash")),
    p_card: num(formData.get("counted_card")),
    p_vipps: num(formData.get("counted_vipps")),
    p_expected_cash: expected.cash,
    p_expected_card: expected.card,
    p_expected_vipps: expected.vipps,
    p_note: String(formData.get("note") ?? ""),
    p_reason: reason,
  });
  if (error) {
    const m = error.message ?? "";
    if (/TOO_OLD/.test(m)) return { error: `Oppgjør eldre enn ${EDIT_DAYS} dager må rettes av admin/eier.` };
    if (/REASON_REQUIRED/.test(m)) return { error: "Skriv kort hvorfor oppgjøret endres." };
    if (error.code === "PGRST202" || /edit_cash_settlement/.test(m))
      return { error: "Endring er ikke slått på ennå (KJØR-I-SUPABASE-KASSEOPPGJOR-ENDRE.sql)." };
    return { error: `Kunne ikke lagre endringen: ${m}` };
  }
  revalidatePath("/kasse/kasseoppgjor");
  revalidatePath("/admin/kasseoppgjor");
  return { ok: true };
}
