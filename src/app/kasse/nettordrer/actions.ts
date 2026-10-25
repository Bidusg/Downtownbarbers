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

/** Ordren er plukket og klar til henting – kunden får e-post. */
export async function markOrderReady(id: string): Promise<R> {
  await requireRole(["shop", "admin"]);
  const { sb, o } = await load(id);
  if (!o) return { error: "Fant ikke ordren." };
  if (o.status !== "new") return { error: "Ordren er allerede behandlet." };
  const { error } = await sb.from("online_orders").update({ status: "ready", ready_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Kunne ikke lagre." };
  if (o.delivery === "pickup") {
    try {
      await sendOrderUpdate(o.email, { orderNo: o.order_no, name: o.name, kind: "ready", orderUrl: orderUrl(o.id, o.access_token) });
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
    }
  }

  const tr = o.delivery === "ship" ? (tracking ?? "").trim().slice(0, 60) || null : null;
  const { error } = await sb.rpc("complete_online_order", { p_order: id, p_payment_method: payMethod, p_tracking: tr });
  if (error) return { error: /ALREADY_DONE/.test(error.message) ? "Ordren er allerede avsluttet." : "Kunne ikke registrere salget. Prøv igjen." };

  if (o.delivery === "ship") {
    try {
      await sendOrderUpdate(o.email, { orderNo: o.order_no, name: o.name, kind: "shipped", trackingNo: tr, orderUrl: orderUrl(o.id, o.access_token) });
    } catch {
      /* beste innsats */
    }
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
  done();
  revalidatePath("/kasse/lager");
  return { ok: true };
}
