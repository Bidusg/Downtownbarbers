"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cancelPayment, capturePayment } from "@/lib/vipps";
import { sendOrderUpdate } from "@/lib/email";
import { orderUrl } from "@/lib/shop-orders";

type R = { ok?: true; error?: string };

function done() {
  revalidatePath("/kasse/nettordrer");
  revalidatePath("/admin/nettordrer");
  revalidatePath("/kasse", "layout");
}

async function load(id: string) {
  const sb = await createClient();
  const { data } = await sb
    .from("online_orders")
    .select("id, order_no, access_token, name, email, delivery, payment_method, payment_status, status, vipps_reference, total_nok, tracking_no")
    .eq("id", id)
    .maybeSingle();
  return { sb, o: data as null | {
    id: string; order_no: number; access_token: string; name: string; email: string;
    delivery: "pickup" | "ship"; payment_method: "vipps" | "card" | "pay_at_pickup";
    payment_status: string; status: string; vipps_reference: string | null; total_nok: number; tracking_no: string | null;
  } };
}

export type PickResult = {
  ok?: true;
  error?: string;
  /** Kort beskjed til den som plukker («Villmark Beard Balm – 1 av 1»). */
  msg?: string;
  done?: boolean;
};

const PICK_ERR: Record<string, string> = {
  CLOSED: "Ordren er allerede avsluttet.",
  NOT_FOUND: "Fant ikke ordren.",
  NO_CODE: "Ingen strekkode.",
};

function pickErr(message: string): string {
  const k = Object.keys(PICK_ERR).find((key) => message.includes(key));
  if (k) return PICK_ERR[k];
  if (/function|schema cache|does not exist/i.test(message)) return "Kjør KJØR-I-SUPABASE-NETTORDRE-PLUKK.sql i Supabase først.";
  return "Kunne ikke lagre. Prøv igjen.";
}

/**
 * Plukk: skann en strekkode (code), eller +1/-1 på en linje (itemId + delta)
 * for varer uten strekkode. Feil vare stoppes.
 */
export async function pickItem(orderId: string, code: string | null, itemId: string | null = null, delta = 1): Promise<PickResult> {
  await requireRole(["shop", "admin"]);
  const sb = await createClient();
  const { data, error } = await sb.rpc("online_order_pick", {
    p_order: orderId,
    p_code: code,
    p_item: itemId,
    p_delta: Math.max(-1, Math.min(1, delta)) || 1,
  });
  if (error) return { error: pickErr(error.message) };
  const r = data as { ok: boolean; error?: string; name?: string; code?: string; picked?: number; qty?: number; done?: boolean };
  if (!r.ok) {
    if (r.error === "UNKNOWN") return { error: `Ukjent strekkode (${r.code}). Legg den inn på produktet i admin, eller bruk + på linjen.` };
    if (r.error === "NOT_IN_ORDER") return { error: `Feil vare: ${r.name} står ikke på denne ordren.` };
    if (r.error === "ALREADY_PICKED") return { error: `${r.name} er allerede plukket.` };
    return { error: "Kunne ikke registrere varen." };
  }
  done();
  return { ok: true, msg: `${r.name} – ${r.picked} av ${r.qty}`, done: r.done };
}

/** Varen finnes ikke på hylla: tas ut av ordren, totalen regnes om. */
export async function setItemMissing(itemId: string, missing: boolean): Promise<R> {
  await requireRole(["shop", "admin"]);
  const sb = await createClient();
  const { error } = await sb.rpc("online_order_set_missing", { p_item: itemId, p_missing: missing });
  if (error) return { error: pickErr(error.message) };
  done();
  revalidatePath("/kasse/lager");
  return { ok: true };
}

/** Hele ordren er plukket → klar til henting (kunden får e-post) / pakket. */
export async function markOrderReady(id: string): Promise<R> {
  await requireRole(["shop", "admin"]);
  const { sb, o } = await load(id);
  if (!o) return { error: "Fant ikke ordren." };
  const { error } = await sb.rpc("online_order_mark_ready", { p_order: id });
  if (error) {
    if (/NOT_PICKED/.test(error.message)) return { error: "Skann eller merk alle varene først." };
    if (/NOTHING_LEFT/.test(error.message)) return { error: "Alle varene mangler – kanseller ordren i stedet." };
    if (/ALREADY_DONE/.test(error.message)) return { error: "Ordren er allerede behandlet." };
    return { error: pickErr(error.message) };
  }
  if (o.delivery === "pickup") {
    try {
      const { data: missing } = await sb
        .from("online_order_items")
        .select("name, missing_qty")
        .eq("order_id", id)
        .gt("missing_qty", 0);
      const { data: fresh } = await sb.from("online_orders").select("total_nok").eq("id", id).maybeSingle();
      await sendOrderUpdate(o.email, {
        orderNo: o.order_no,
        name: o.name,
        kind: "ready",
        orderUrl: orderUrl(o.id, o.access_token),
        missing: ((missing ?? []) as { name: string; missing_qty: number }[]).map((m) => `${m.missing_qty} × ${m.name}`),
        totalNok: fresh ? Number((fresh as { total_nok: number }).total_nok) : undefined,
      });
    } catch {
      /* e-post er beste innsats */
    }
  }
  done();
  return { ok: true };
}

/**
 * Utlevert (henting) eller sendt (frakt). Vipps/kort: beløpet trekkes nå.
 * Betal ved henting: kassa velger hvordan kunden betalte.
 */
export async function completeOrder(id: string, method: string | null, tracking: string | null): Promise<R> {
  await requireRole(["shop", "admin"]);
  const { sb, o } = await load(id);
  if (!o) return { error: "Fant ikke ordren." };
  if (o.status === "picked_up" || o.status === "shipped" || o.status === "cancelled") return { error: "Ordren er allerede avsluttet." };
  // Sjekk plukkingen FØR noe trekkes i Vipps.
  const { data: picked, error: pickedErr } = await sb.rpc("online_order_fully_picked", { p_order: id });
  if (!pickedErr && picked === false) return { error: "Skann eller merk alle varene først." };
  if (Number(o.total_nok) <= 0) return { error: "Alle varene mangler – kanseller ordren i stedet." };
  const { count: missingLines } = await sb
    .from("online_order_items")
    .select("id", { count: "exact", head: true })
    .eq("order_id", id)
    .gt("missing_qty", 0);

  let payMethod = "Vipps";
  if (o.payment_method === "pay_at_pickup") {
    if (!method || !["Kontant", "Kort", "Vipps"].includes(method)) return { error: "Velg hvordan kunden betalte." };
    payMethod = method;
  } else {
    if (o.payment_status !== "authorized" && o.payment_status !== "paid") return { error: "Betalingen er ikke godkjent i Vipps." };
    if (o.payment_status === "authorized") {
      if (!o.vipps_reference) return { error: "Mangler Vipps-referanse." };
      try {
        await capturePayment(o.vipps_reference, Math.round(Number(o.total_nok) * 100));
      } catch {
        return { error: "Vipps godtok ikke trekket. Sjekk ordren i Vipps-portalen (reservasjonen kan ha utløpt)." };
      }
      // Merk som trukket med en gang, så et nytt forsøk ikke trekker to ganger.
      await sb.from("online_orders").update({ payment_status: "paid" }).eq("id", id);
      // Manglet noe, ble det trukket mindre enn reservert: frigjør resten.
      if ((missingLines ?? 0) > 0) {
        try {
          await cancelPayment(o.vipps_reference);
        } catch {
          /* resten av reservasjonen løper ut av seg selv */
        }
      }
    }
  }

  const tr = o.delivery === "ship" ? (tracking ?? "").trim().slice(0, 60) || null : null;
  const { error } = await sb.rpc("complete_online_order", { p_order: id, p_payment_method: payMethod, p_tracking: tr });
  if (error) {
    if (/ALREADY_DONE/.test(error.message)) return { error: "Ordren er allerede avsluttet." };
    if (/NOT_PICKED/.test(error.message)) return { error: "Skann eller merk alle varene først." };
    return { error: "Kunne ikke registrere salget. Prøv igjen." };
  }

  try {
    const { data: fresh } = await sb.from("online_orders").select("total_nok").eq("id", id).maybeSingle();
    await sendOrderUpdate(o.email, {
      orderNo: o.order_no,
      name: o.name,
      kind: o.delivery === "ship" ? "shipped" : "picked_up",
      trackingNo: tr,
      orderUrl: orderUrl(o.id, o.access_token),
      totalNok: fresh ? Number((fresh as { total_nok: number }).total_nok) : Number(o.total_nok),
    });
  } catch {
    /* beste innsats */
  }
  done();
  revalidatePath("/kasse/lager");
  return { ok: true };
}

/** Kanseller: frigjør Vipps-reservasjonen og legg varene tilbake på lager. */
export async function cancelOrder(id: string): Promise<R> {
  await requireRole(["shop", "admin"]);
  const { sb, o } = await load(id);
  if (!o) return { error: "Fant ikke ordren." };
  if (o.status === "picked_up" || o.status === "shipped") return { error: "Ordren er fullført – bruk retur/refusjon i Vipps-portalen." };
  if (o.status === "cancelled") return { ok: true };
  if (o.payment_status === "paid") return { error: "Beløpet er allerede trukket – refunder i Vipps-portalen først." };
  if (o.payment_status === "authorized" && o.vipps_reference) {
    try {
      await cancelPayment(o.vipps_reference);
    } catch {
      return { error: "Kunne ikke frigjøre beløpet i Vipps. Prøv igjen." };
    }
  }
  const { error } = await sb.rpc("cancel_online_order", { p_order: id });
  if (error) return { error: "Kunne ikke kansellere." };
  try {
    await sendOrderUpdate(o.email, {
      orderNo: o.order_no,
      name: o.name,
      kind: "cancelled",
      orderUrl: orderUrl(o.id, o.access_token),
      reserved: o.payment_status === "authorized",
    });
  } catch {
    /* beste innsats */
  }
  done();
  revalidatePath("/kasse/lager");
  return { ok: true };
}
