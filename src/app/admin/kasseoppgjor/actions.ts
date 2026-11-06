"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { postDailyVoucher } from "@/lib/tripletex/voucher";
import { parseFixitSettlementPdf, type FixitSettlementRow } from "@/lib/fixit-settlement";
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

  return writeSettlementOverride({
    settle_date,
    cash: num(formData.get("counted_cash")),
    card: num(formData.get("counted_card")),
    vipps: num(formData.get("counted_vipps")),
    note: String(formData.get("note") ?? "").trim(),
    reason: `Admin-overstyring: ${reason}`,
    noteReason: `Overstyrt av admin: ${reason}`,
    postVoucher: true,
  });
}

/**
 * Skriv kontant/kort/Vipps for en dag: retter eksisterende oppgjør (med
 * historikk via edit_cash_settlement) eller oppretter et bekreftet oppgjør.
 * Felles for admin-overstyring og Fixit-import. Ingen rollesjekk her –
 * kallerne sjekker admin selv.
 */
async function writeSettlementOverride(o: {
  settle_date: string;
  cash: number;
  card: number;
  vipps: number;
  note: string;
  /** Lagres i historikken (påkrevd av edit_cash_settlement). */
  reason: string;
  /** Legges i notatet når historikk-RPC-en mangler / ved nytt oppgjør. */
  noteReason: string;
  postVoucher: boolean;
}): Promise<{ ok?: true; error?: string }> {
  const { settle_date, cash, card, vipps, note } = o;
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
      p_reason: o.reason,
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
        note: [note, o.noteReason].filter(Boolean).join(" · "),
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
    note: [note, o.noteReason].filter(Boolean).join(" · "),
    opened_by: user?.id ?? null,
  };
  let { error } = await sb.from("cash_settlements").insert({ ...row, confirmed: true });
  if (error && /confirmed/.test(error.message)) {
    ({ error } = await sb.from("cash_settlements").insert(row));
  }
  if (error) return { error: `Kunne ikke lagre: ${error.message}` };
  revalidate();
  if (o.postVoucher) {
    try {
      await postDailyVoucher(settle_date);
    } catch {
      /* oppgjøret er lagret; natt-cron er backup */
    }
  }
  return { ok: true };
}

/* ------------------------- FIXIT-IMPORT ------------------------- */

const FIXIT_SQL_HINT = "Kjør KJØR-I-SUPABASE-FIXIT-OPPGJOR.sql i Supabase først.";

export type FixitPreviewDay = {
  date: string;
  nrs: number[];
  fixit: { total: number; card: number; other: number; cash: number; gift: number };
  ours: {
    salesTotal: number;
    card: number;
    vipps: number;
    cash: number;
    /** Talt/oppgjort hvis dagen har oppgjør. */
    counted: { cash: number; card: number; vipps: number } | null;
  };
};

/** Les Fixit-PDF-en og vis den dag for dag ved siden av vårt system. */
export async function previewFixitImport(
  formData: FormData,
): Promise<{ ok?: true; error?: string; period?: string | null; rows?: FixitSettlementRow[]; days?: FixitPreviewDay[] }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Bare admin/eier kan importere." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Velg Fixit-PDF-en (Kasseoppgjør)." };
  if (file.size > 4 * 1024 * 1024) return { error: "Filen er for stor (maks 4 MB)." };
  if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) return { error: "Filen må være en PDF." };

  let parsed: Awaited<ReturnType<typeof parseFixitSettlementPdf>>;
  try {
    parsed = await parseFixitSettlementPdf(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return { error: "Kunne ikke lese PDF-en." };
  }
  if (parsed.rows.length === 0) {
    return { error: "Fant ingen oppgjør i PDF-en. Er det Fixit-rapporten «Kasseoppgjør»?" };
  }

  const dates = [...new Set(parsed.rows.map((r) => r.date))].sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const span = Math.round((Date.parse(last) - Date.parse(first)) / 86400000) + 1;
  const ours = await getDailyReconciliation(last, Math.min(span, 186));
  const oursBy = new Map(ours.map((r) => [r.date, r]));

  const days: FixitPreviewDay[] = dates.map((date) => {
    const rs = parsed.rows.filter((r) => r.date === date);
    const sum = (f: (r: FixitSettlementRow) => number) => Math.round(rs.reduce((a, r) => a + f(r), 0));
    const o = oursBy.get(date);
    return {
      date,
      nrs: rs.map((r) => r.nr),
      fixit: {
        total: sum((r) => r.total),
        card: sum((r) => r.bankCard + r.creditCard),
        other: sum((r) => r.other),
        cash: sum((r) => r.cash),
        gift: sum((r) => r.giftCard),
      },
      ours: {
        salesTotal: o?.salesTotal ?? 0,
        card: o?.expected.card ?? 0,
        vipps: o?.expected.vipps ?? 0,
        cash: o?.expected.cash ?? 0,
        counted: o?.counted ?? null,
      },
    };
  });
  return { ok: true, period: parsed.period, rows: parsed.rows, days };
}

/**
 * Lagre Fixit-oppgjørene og (valgfritt) overstyr dagsoppgjøret med Fixit-
 * tallene. Kort = Bankkort + Kredittkort, Vipps = det Fixit ikke fører på
 * noen betalingsmåte, Kontant = Fixits kontant. Det som ikke overstyres
 * beholdes fra dagens oppgjør (eller tallene fra kassen hvis ikke oppgjort).
 */
export async function applyFixitImport(
  rows: FixitSettlementRow[],
  opts: { card: boolean; vipps: boolean; cash: boolean; dates: string[] },
): Promise<{ ok?: true; error?: string; saved?: number; overridden?: number }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Bare admin/eier kan importere." };
  const clean = (rows ?? []).filter(
    (r) =>
      Number.isInteger(r.nr) &&
      /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
      [r.total, r.cash, r.bankCard, r.creditCard, r.credit, r.giftCard, r.giro, r.other].every(
        (n) => Number.isFinite(n) && n >= 0 && n < 10_000_000,
      ),
  );
  if (!clean.length) return { error: "Ingen gyldige oppgjør å lagre." };

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const { error } = await sb.from("fixit_settlements").upsert(
    clean.map((r) => ({
      nr: r.nr,
      settle_date: r.date,
      treatment_nok: r.treatment,
      products_nok: r.products,
      total_nok: r.total,
      cash_nok: r.cash,
      bankcard_nok: r.bankCard,
      creditcard_nok: r.creditCard,
      credit_nok: r.credit,
      giftcard_nok: r.giftCard,
      giro_nok: r.giro,
      other_nok: r.other,
      imported_at: new Date().toISOString(),
      imported_by: user?.id ?? null,
    })),
    { onConflict: "nr" },
  );
  if (error) {
    return { error: /fixit_settlements/.test(error.message) ? FIXIT_SQL_HINT : `Kunne ikke lagre: ${error.message}` };
  }

  let overridden = 0;
  const wanted = new Set(opts.dates ?? []);
  if (opts.card || opts.vipps || opts.cash) {
    const dates = [...new Set(clean.map((r) => r.date))].filter((d) => wanted.has(d)).sort();
    for (const date of dates) {
      const rs = clean.filter((r) => r.date === date);
      const f = {
        card: Math.round(rs.reduce((a, r) => a + r.bankCard + r.creditCard, 0)),
        vipps: Math.round(rs.reduce((a, r) => a + r.other, 0)),
        cash: Math.round(rs.reduce((a, r) => a + r.cash, 0)),
      };
      // Nåværende verdier for det som ikke overstyres.
      const { data: cur } = await sb
        .from("cash_settlements")
        .select("counted_cash, counted_card, counted_vipps")
        .eq("settle_date", date)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const exp = cur ? null : await getExpectedByMethodForDate(date);
      const now = {
        cash: Number(cur?.counted_cash ?? exp?.cash ?? 0),
        card: Number(cur?.counted_card ?? exp?.card ?? 0),
        vipps: Number(cur?.counted_vipps ?? exp?.vipps ?? 0),
      };
      const nrs = rs.map((r) => r.nr).join(", ");
      const what = [opts.card && "kort", opts.vipps && "Vipps", opts.cash && "kontant"].filter(Boolean).join(", ");
      const res = await writeSettlementOverride({
        settle_date: date,
        cash: opts.cash ? f.cash : now.cash,
        card: opts.card ? f.card : now.card,
        vipps: opts.vipps ? f.vipps : now.vipps,
        note: "",
        reason: `Fixit-import (oppgjør nr ${nrs}): ${what}`,
        noteReason: `Fra Fixit-oppgjør nr ${nrs} (${what})`,
        postVoucher: false,
      });
      if (res.error) return { error: `${date}: ${res.error}`, saved: clean.length, overridden };
      overridden++;
    }
  }
  revalidatePath("/admin/kasseoppgjor");
  revalidatePath("/revisor/kasseoppgjor");
  return { ok: true, saved: clean.length, overridden };
}
