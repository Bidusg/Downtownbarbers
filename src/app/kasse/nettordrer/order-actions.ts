"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendOrderUpdate } from "@/lib/email";
import { orderUrl } from "@/lib/shop-orders";

/* =====================================================================
 * Endre ordre, retur / reklamasjon / bytte, notat (kasse + admin).
 * ===================================================================== */

type R = { ok?: true; error?: string };

function done(id: string) {
  for (const base of ["/kasse/nettordrer", "/admin/nettordrer"]) revalidatePath(base, "layout");
  void id;
  revalidatePath("/kasse/lager");
}

function dbError(message: string): string {
  if (/OUT_OF_STOCK:(.*)/.test(message)) return `Ikke nok på lager: ${message.match(/OUT_OF_STOCK:([^\n]*)/)?.[1]?.trim()}.`;
  if (/OVER_AUTHORIZED:(.*)/.test(message))
    return `Kunden har godkjent ${message.match(/OVER_AUTHORIZED:([\d.]+)/)?.[1] ?? ""} kr i Vipps – totalen kan ikke bli høyere. Ta mellomlegget i kassa, eller lag en ny ordre.`;
  if (/REFUND_TOO_HIGH:(.*)/.test(message)) return `Du kan refundere maks ${message.match(/REFUND_TOO_HIGH:([\d.]+)/)?.[1]} kr på denne ordren.`;
  if (/TOO_MANY:(.*)/.test(message)) return `Kunden har ikke så mange igjen av ${message.match(/TOO_MANY:([^\n]*)/)?.[1]?.trim()}.`;
  if (/CLOSED/.test(message)) return "Ordren er allerede utlevert/sendt – bruk retur i stedet.";
  if (/NOT_COMPLETED/.test(message)) return "Retur gjelder ordrer som er utlevert eller sendt. En åpen ordre endrer du direkte.";
  if (/EMPTY/.test(message)) return "Ordren kan ikke stå tom – kanseller den i stedet.";
  if (/NOTHING/.test(message)) return "Velg minst én vare.";
  if (/BAD_METHOD/.test(message))
    return "Refusjonsmåten ble ikke godtatt. Er «Gavekort» valgt, må KJØR-I-SUPABASE-NETTORDRE-TILGODELAPP.sql kjøres i Supabase først.";
  if (/GIFT_FAILED/.test(message)) return "Klarte ikke å utstede gavekortet. Prøv igjen, eller velg Kort/Kontant.";
  if (/function|schema cache|does not exist/i.test(message)) return "Kjør KJØR-I-SUPABASE-NETTORDRE-RETUR.sql i Supabase først.";
  return "Kunne ikke lagre. Prøv igjen.";
}

async function loadOrder(id: string) {
  const sb = await createClient();
  const { data } = await sb
    .from("online_orders")
    .select("id, order_no, access_token, name, email, status, payment_method, payment_status, vipps_reference, total_nok")
    .eq("id", id)
    .maybeSingle();
  return {
    sb,
    o: data as null | {
      id: string; order_no: number; access_token: string; name: string; email: string; status: string;
      payment_method: "vipps" | "card" | "pay_at_pickup"; payment_status: string; vipps_reference: string | null; total_nok: number;
    },
  };
}

/** Endre en åpen ordre: nytt antall per linje (0 = fjern) og nye varer. */
export async function editOrder(
  id: string,
  changes: { item: string; qty: number }[],
  adds: { product: string; qty: number }[],
  note: string,
  notifyCustomer: boolean,
): Promise<R> {
  await requireRole(["shop", "admin"]);
  const { sb, o } = await loadOrder(id);
  if (!o) return { error: "Fant ikke ordren." };
  if (!changes.length && !adds.length) return { error: "Ingen endringer." };
  const { data, error } = await sb.rpc("online_order_edit", {
    p_order: id,
    p_changes: changes.map((c) => ({ item: c.item, qty: Math.max(0, Math.round(c.qty)) })),
    p_adds: adds.filter((a) => a.qty > 0).map((a) => ({ product: a.product, qty: Math.round(a.qty) })),
    p_note: note.slice(0, 500) || null,
  });
  if (error) return { error: dbError(error.message) };
  const r = data as { total_nok: number; changes: string };
  if (notifyCustomer) {
    try {
      await sendOrderUpdate(o.email, {
        orderNo: o.order_no,
        name: o.name,
        kind: "changed",
        summary: r.changes,
        totalNok: Number(r.total_nok),
        orderUrl: orderUrl(o.id, o.access_token),
      });
    } catch {
      /* beste innsats */
    }
  }
  done(id);
  return { ok: true };
}

/**
 * Retur / reklamasjon / bytte på en utlevert ordre. Refusjon gis som
 * gavekort (tilgodelapp), kort i terminalen eller kontant – Vipps-refusjon
 * er ikke en mulighet hos oss. Velges «Gavekort», utsteder databasen et
 * gavekort på beløpet og returnerer koden, som vises i kassa og sendes
 * kunden på e-post.
 */
export async function returnOrder(input: {
  id: string;
  kind: "retur" | "reklamasjon" | "bytte";
  lines: { item: string; qty: number }[];
  restock: boolean;
  refund: number;
  /** Vipps-refusjon finnes ikke hos oss – gavekort er alternativet. */
  refundMethod: "Gavekort" | "Kort" | "Kontant" | "";
  replacements: { product: string; qty: number }[];
  extra: number;
  extraMethod: "Vipps" | "Kort" | "Kontant" | "";
  note: string;
  notifyCustomer: boolean;
}): Promise<R & { giftCode?: string }> {
  await requireRole(["shop", "admin"]);
  const { sb, o } = await loadOrder(input.id);
  if (!o) return { error: "Fant ikke ordren." };
  const refund = Math.max(0, Math.round(Number(input.refund || 0) * 100) / 100);
  const extra = Math.max(0, Math.round(Number(input.extra || 0) * 100) / 100);
  if (refund > 0 && !input.refundMethod) return { error: "Velg hvordan pengene betales tilbake." };
  if (extra > 0 && !input.extraMethod) return { error: "Velg hvordan kunden betaler mellomlegget." };

  const { data, error } = await sb.rpc("online_order_return", {
    p_order: input.id,
    p_kind: input.kind,
    p_lines: input.lines.filter((l) => l.qty > 0),
    p_restock: input.restock,
    p_refund: refund,
    p_refund_method: refund > 0 ? input.refundMethod : null,
    p_replacements: input.replacements.filter((r) => r.qty > 0),
    p_extra: extra,
    p_extra_method: extra > 0 ? input.extraMethod : null,
    p_note: input.note.slice(0, 500) || null,
  });
  if (error) return { error: dbError(error.message) };
  const res = (data ?? {}) as { gift_code?: string | null; replaced_with?: string | null };
  const giftCode = res.gift_code ?? undefined;

  if (input.notifyCustomer) {
    try {
      const { data: items } = await sb.from("online_order_items").select("id, name").eq("order_id", input.id);
      const names = new Map(((items ?? []) as { id: string; name: string }[]).map((i) => [i.id, i.name]));
      // Hva kunden byttet TIL. Databasen gir navnene; faller den tilbake,
      // slår vi dem opp på produktene selv.
      let replacedWith = (res.replaced_with ?? "").trim();
      if (!replacedWith && input.replacements.some((r) => r.qty > 0)) {
        const ids = input.replacements.filter((r) => r.qty > 0).map((r) => r.product);
        const { data: prods } = await sb.from("products").select("id, name, web_name").in("id", ids);
        const pn = new Map(
          ((prods ?? []) as { id: string; name: string; web_name: string | null }[]).map((x) => [
            x.id,
            x.web_name || x.name,
          ]),
        );
        replacedWith = input.replacements
          .filter((r) => r.qty > 0)
          .map((r) => `${r.qty} × ${pn.get(r.product) ?? "vare"}`)
          .join(", ");
      }
      await sendOrderUpdate(o.email, {
        orderNo: o.order_no,
        name: o.name,
        kind: "returned",
        returnKind: input.kind,
        summary: input.lines
          .filter((l) => l.qty > 0)
          .map((l) => `${l.qty} × ${names.get(l.item) ?? "vare"}`)
          .join(", "),
        replacedWith: replacedWith || undefined,
        refundNok: refund,
        refundMethod: input.refundMethod || undefined,
        giftCode,
        extraNok: extra > 0 ? extra : undefined,
        extraMethod: extra > 0 ? input.extraMethod || undefined : undefined,
        orderUrl: orderUrl(o.id, o.access_token),
      });
    } catch {
      /* beste innsats */
    }
  }
  done(input.id);
  return { ok: true, giftCode };
}

/** Notat i ordrehistorikken. */
export async function addOrderNote(id: string, text: string): Promise<R> {
  await requireRole(["shop", "admin"]);
  const sb = await createClient();
  const { error } = await sb.rpc("online_order_note", { p_order: id, p_text: text.slice(0, 1000) });
  if (error) return { error: dbError(error.message) };
  done(id);
  return { ok: true };
}
