"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { postDailyVoucher } from "@/lib/tripletex/voucher";
import {
  getExpectedByMethodForDate,
  getDailyReconciliation,
  type MethodBreakdown,
  type DailyReconRow,
} from "@/lib/ops-queries";

function num(v: FormDataEntryValue | null): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Forventet salg per betalingsmåte for en dato (til live-avstemming i skjemaet). */
export async function expectedByMethod(date: string): Promise<MethodBreakdown> {
  if (!date) return { cash: 0, card: 0, vipps: 0 };
  return getExpectedByMethodForDate(date);
}

export async function createSettlement(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const sb = await createClient();
  const settle_date = String(formData.get("settle_date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settle_date)) return { error: "Velg en gyldig dato." };
  for (const f of ["counted_cash", "counted_card", "counted_vipps"]) {
    const raw = String(formData.get(f) ?? "").trim();
    if (raw !== "" && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) {
      return { error: "Talte beløp må være 0 eller mer." };
    }
  }

  const counted_cash = num(formData.get("counted_cash"));
  const counted_card = num(formData.get("counted_card"));
  const counted_vipps = num(formData.get("counted_vipps"));

  // Forventet regnes ut server-side (snapshot) – aldri fra klienten.
  const expected = await getExpectedByMethodForDate(settle_date);

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

  // Løsning D: finnes det et auto-UTKAST (confirmed=false) for dagen, bekrefter
  // vi DET i stedet for å lage en dublett – da forsvinner også banneren.
  // Før SQL (confirmed-kolonnen mangler) feiler select-en → vi faller trygt
  // tilbake til et vanlig insert, nøyaktig som før.
  try {
    const { data: draft } = await sb
      .from("cash_settlements")
      .select("id")
      .eq("settle_date", settle_date)
      .eq("confirmed", false)
      .limit(1)
      .maybeSingle();
    if (draft?.id) {
      const { error: upErr } = await sb
        .from("cash_settlements")
        .update({ ...values, confirmed: true })
        .eq("id", draft.id);
      if (!upErr) {
        revalidatePath("/admin/kasseoppgjor");
        try {
          await postDailyVoucher(settle_date);
        } catch {
          /* kasseoppgjøret er lagret; natt-cron er backup */
        }
        return { ok: true };
      }
    }
  } catch {
    // confirmed-kolonnen finnes ikke enda → fall videre til vanlig insert.
  }

  const { error } = await sb.from("cash_settlements").insert({
    settle_date,
    ...values,
  });
  if (error) return { error: `Kunne ikke lagre oppgjøret: ${error.message}` };
  revalidatePath("/admin/kasseoppgjor");

  // Dagsoppgjør → Tripletex: når kasseoppgjøret registreres ved stengetid,
  // sendes dagens bilag som UBOKFØRT UTKAST med det samme (henger sammen med
  // kasseoppgjøret). postDailyVoucher er trygg å kalle her:
  //   • TRIPLETEX_POSTING_ENABLED=false → kun tørrkjøring, ingenting sendes.
  //   • Duplikatsperre på datoen → natt-cronen (backup) poster ikke på nytt.
  // Feiler Tripletex, skal det ALDRI velte selve kasseoppgjøret – vi svelger
  // feilen her; natt-cronen tar dagen som sikkerhetsnett.
  try {
    await postDailyVoucher(settle_date);
  } catch {
    // Bevisst stille: kasseoppgjøret er allerede lagret. Natt-cron er backup.
  }
  return { ok: true };
}

/**
 * Bekreft et auto-utkast (løsning D): setter confirmed = true, slik at den
 * røde banneren / den daglige påminnelsen slutter å mase for den dagen.
 * Valgfri `counted`-overstyring lar mennesket korrigere opptellingen før
 * bekreftelse (ellers beholdes utkastets forhåndsutfylte beløp).
 *
 * Degraderer trygt FØR SQL (confirmed-kolonnen) er kjørt: da finnes ingen
 * ubekreftede utkast, og et forsøk svarer med en forklarende feil uten å
 * velte noe.
 */
export async function confirmSettlement(
  id: string,
  counted?: { cash: number; card: number; vipps: number },
): Promise<{ ok: boolean; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { ok: false, error: "Ingen tilgang." };
  const sb = await createClient();
  const patch: Record<string, unknown> = { confirmed: true };
  if (counted) {
    const c = Math.max(0, Math.round(counted.cash || 0));
    const k = Math.max(0, Math.round(counted.card || 0));
    const v = Math.max(0, Math.round(counted.vipps || 0));
    patch.counted_cash = c;
    patch.counted_card = k;
    patch.counted_vipps = v;
    patch.total_nok = c + k + v;
  }
  const { error } = await sb.from("cash_settlements").update(patch).eq("id", id);
  if (error) return { ok: false, error: `Kunne ikke bekrefte: ${error.message}` };
  revalidatePath("/admin/kasseoppgjor");
  return { ok: true };
}

export async function deleteSettlement(id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient();
  const { error } = await sb.from("cash_settlements").delete().eq("id", id);
  if (error) return { ok: false, error: `Kunne ikke slette: ${error.message}` };
  revalidatePath("/admin/kasseoppgjor");
  return { ok: true };
}

/**
 * Eldre dager i dag-for-dag-visningen: hent {days} dager t.o.m. {endDate}.
 * Brukes av «Vis eldre» for å bla bakover uten å laste hele siden på nytt.
 */
export async function moreReconciliation(
  endDate: string,
  days: number,
): Promise<DailyReconRow[]> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return [];
  return getDailyReconciliation(endDate, Math.min(Math.max(days, 1), 92));
}
