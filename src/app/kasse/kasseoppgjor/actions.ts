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
};

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
    .select("counted_cash, counted_card, counted_vipps, note, confirmed")
    .eq("settle_date", date)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!withConfirmed.error && withConfirmed.data) {
    const row = withConfirmed.data as {
      counted_cash: number | null;
      counted_card: number | null;
      counted_vipps: number | null;
      note: string | null;
      confirmed: boolean | null;
    };
    if (row.confirmed !== false) {
      return {
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
