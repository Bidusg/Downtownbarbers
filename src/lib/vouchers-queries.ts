import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * Query-lag for bilag til revisor. Dawit laster opp bilag i admin, og de
 * dukker automatisk opp her – både for admin og revisor (RLS styrer
 * tilgangen). Alt degraderer til tomt ved feil.
 * ===================================================================== */

export type Voucher = {
  id: string;
  title: string;
  supplier: string | null;
  voucherDate: string | null;
  kind: "faktura" | "kvittering" | "bilag" | "annet";
  amountNok: number | null;
  vatNok: number | null;
  sizeBytes: number | null;
  mime: string | null;
  createdAt: string;
};

type VoucherRow = {
  id: string;
  title: string;
  supplier: string | null;
  voucher_date: string | null;
  kind: Voucher["kind"];
  amount_nok: number | string | null;
  vat_nok: number | string | null;
  size_bytes: number | null;
  mime: string | null;
  created_at: string;
};

function toNum(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lister alle bilag, sortert etter bilagsdato (nyeste først, null til slutt),
 * deretter opprettelsestidspunkt. Fungerer for både admin og revisor – RLS
 * avgjør hvem som ser hva.
 */
export async function getVouchers(): Promise<Voucher[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("vouchers")
      .select(
        "id, title, supplier, voucher_date, kind, amount_nok, vat_nok, size_bytes, mime, created_at",
      )
      .order("voucher_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    return ((data as VoucherRow[]) ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      supplier: r.supplier,
      voucherDate: r.voucher_date,
      kind: r.kind,
      amountNok: toNum(r.amount_nok),
      vatNok: toNum(r.vat_nok),
      sizeBytes: r.size_bytes,
      mime: r.mime,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}
