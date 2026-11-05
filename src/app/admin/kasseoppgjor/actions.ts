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
  // Kort og Vipps føres automatisk fra salgene i kassen – bare kontant telles.
  const cashRaw = String(formData.get("counted_cash") ?? "").trim();
  if (cashRaw === "" || !Number.isFinite(Number(cashRaw)) || Number(cashRaw) < 0) {
    return { error: "Fyll inn talt kontantbeholdning (skriv 0 hvis det ikke er kontanter)." };
  }
  const counted_cash = num(formData.get("counted_cash"));

  // Forventet regnes ut server-side (snapshot) – aldri fra klienten.
  const expected = await getExpectedByMethodForDate(settle_date);
  const counted_card = expected.card;
  const counted_vipps = expected.vipps;

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

  // Finnes det allerede et oppgjør for dagen, OPPDATERER vi det i stedet for å
  // lage en ny rad. Tidligere ble det to rader samme dag (én med 0 kr som så
  // ut som manko).
  {
    const { data: prev } = await sb
      .from("cash_settlements")
      .select("id")
      .eq("settle_date", settle_date)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prev?.id) {
      const { error: upErr } = await sb
        .from("cash_settlements")
        .update(values)
        .eq("id", prev.id as string);
      if (upErr) return { error: `Kunne ikke lagre oppgjøret: ${upErr.message}` };
      revalidatePath("/admin/kasseoppgjor");
      return { ok: true };
    }
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
    // Kort/Vipps følger salgene automatisk; bare kontant tas fra opptellingen.
    const { data: row } = await sb
      .from("cash_settlements")
      .select("settle_date")
      .eq("id", id)
      .maybeSingle();
    const exp = row?.settle_date
      ? await getExpectedByMethodForDate(String(row.settle_date))
      : { cash: 0, card: Math.round(counted.card || 0), vipps: Math.round(counted.vipps || 0) };
    const c = Math.max(0, Math.round(counted.cash || 0));
    const k = Math.max(0, exp.card);
    const v = Math.max(0, exp.vipps);
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
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { ok: false, error: "Ingen tilgang." };
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
  // Revisor ser også avstemmingen (lese-kun, /revisor/kasseoppgjor).
  if (!me || !(isAdminRole(me.role) || me.role === "revisor")) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return [];
  return getDailyReconciliation(endDate, Math.min(Math.max(days, 1), 92));
}

/**
 * Admin-overstyring av et dagsoppgjør: sett kontant, kort og Vipps manuelt.
 * Brukes når kort-/Vipps-beløpet fra kassen er feil – f.eks. fordi noen salg
 * bare er slått inn i Fixit, eller prisene der er annerledes. Begrunnelse er
 * påkrevd; de gamle tallene tas vare på i historikken (edit_cash_settlement).
 * Finnes ingen rad for dagen, opprettes et bekreftet oppgjør.
 */
export async function overrideSettlement(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Bare admin/eier kan overstyre oppgjøret." };

  const settle_date = String(formData.get("settle_date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settle_date)) return { error: "Velg en gyldig dato." };
  for (const [f, label] of [
    ["counted_cash", "kontant"],
    ["counted_card", "kort"],
    ["counted_vipps", "Vipps"],
  ] as const) {
    const raw = String(formData.get(f) ?? "").trim();
    if (raw === "" || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
      return { error: `Fyll inn beløp for ${label} (0 eller mer).` };
    }
  }
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "Skriv kort hvorfor beløpet overstyres (f.eks. «salg bare i Fixit»)." };

  const cash = num(formData.get("counted_cash"));
  const card = num(formData.get("counted_card"));
  const vipps = num(formData.get("counted_vipps"));
  const note = String(formData.get("note") ?? "").trim();
  const expected = await getExpectedByMethodForDate(settle_date);
  const sb = await createClient();

  const { data: prev } = await sb
    .from("cash_settlements")
    .select("id")
    .eq("settle_date", settle_date)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const revalidate = () => {
    revalidatePath("/admin/kasseoppgjor");
    revalidatePath("/kasse/kasseoppgjor");
    revalidatePath("/revisor/kasseoppgjor");
  };

  if (prev?.id) {
    const { error } = await sb.rpc("edit_cash_settlement", {
      p_id: prev.id,
      p_cash: cash,
      p_card: card,
      p_vipps: vipps,
      p_expected_cash: expected.cash,
      p_expected_card: expected.card,
      p_expected_vipps: expected.vipps,
      p_note: note,
      p_reason: `Admin-overstyring: ${reason}`,
    });
    if (!error) {
      revalidate();
      return { ok: true };
    }
    // RPC-en finnes ikke (KASSEOPPGJOR-ENDRE.sql ikke kjørt) → vanlig oppdatering.
    if (!(error.code === "PGRST202" || /edit_cash_settlement/.test(error.message ?? ""))) {
      return { error: `Kunne ikke lagre: ${error.message}` };
    }
    const { error: upErr } = await sb
      .from("cash_settlements")
      .update({
        counted_cash: cash,
        counted_card: card,
        counted_vipps: vipps,
        total_nok: cash + card + vipps,
        expected_cash: expected.cash,
        expected_card: expected.card,
        expected_vipps: expected.vipps,
        note: [note, `Overstyrt av admin: ${reason}`].filter(Boolean).join(" · "),
      })
      .eq("id", prev.id as string);
    if (upErr) return { error: `Kunne ikke lagre: ${upErr.message}` };
    revalidate();
    return { ok: true };
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  const row = {
    settle_date,
    counted_cash: cash,
    counted_card: card,
    counted_vipps: vipps,
    total_nok: cash + card + vipps,
    expected_cash: expected.cash,
    expected_card: expected.card,
    expected_vipps: expected.vipps,
    note: [note, `Overstyrt av admin: ${reason}`].filter(Boolean).join(" · "),
    opened_by: user?.id ?? null,
  };
  let { error } = await sb.from("cash_settlements").insert({ ...row, confirmed: true });
  if (error && /confirmed/.test(error.message)) {
    ({ error } = await sb.from("cash_settlements").insert(row));
  }
  if (error) return { error: `Kunne ikke lagre: ${error.message}` };
  revalidate();
  try {
    await postDailyVoucher(settle_date);
  } catch {
    /* oppgjøret er lagret; natt-cron er backup */
  }
  return { ok: true };
}
