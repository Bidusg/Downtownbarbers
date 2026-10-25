import { createServiceClient } from "@/lib/supabase/service";
import { sendOrderAlert, sendOrderConfirmation, type OrderMail } from "@/lib/email";
import { getPaymentStatus } from "@/lib/vipps";
import { siteUrl } from "@/lib/site-url";

/* =====================================================================
 * NETTORDRER – betalingsstatus og e-post (server, service-rollen).
 *   Vipps/kort: beløpet RESERVERES ved kjøp. Ordren markeres «authorized»
 *   (og e-postene sendes) én gang. Trekket skjer i kassa ved utlevering.
 * ===================================================================== */

const CONTACT_INBOX = "contact@downtownbarbers.no";

type OrderRow = {
  id: string;
  order_no: number;
  access_token: string;
  name: string;
  email: string;
  phone: string | null;
  delivery: "pickup" | "ship";
  address: string | null;
  postal_code: string | null;
  city: string | null;
  subtotal_nok: number;
  discount_nok: number;
  shipping_nok: number;
  total_nok: number;
  member_tier: string | null;
  payment_method: "vipps" | "card" | "pay_at_pickup";
  payment_status: string;
  status: string;
  vipps_reference: string | null;
};

export function orderUrl(id: string, token: string): string {
  return `${siteUrl()}/butikk/ordre/${id}?t=${token}`;
}

async function loadOrder(id: string): Promise<{ o: OrderRow; items: OrderMail["items"] } | null> {
  const svc = createServiceClient();
  const { data: o } = await svc.from("online_orders").select("*").eq("id", id).maybeSingle();
  if (!o) return null;
  const { data: items } = await svc
    .from("online_order_items")
    .select("name, qty, line_total_nok")
    .eq("order_id", id);
  return { o: o as OrderRow, items: (items ?? []) as OrderMail["items"] };
}

/** Send ordrebekreftelse til kunden og varsel til salongen. */
export async function sendOrderEmails(id: string): Promise<void> {
  const r = await loadOrder(id);
  if (!r) return;
  const { o, items } = r;
  const mail: OrderMail = {
    orderNo: o.order_no,
    name: o.name,
    items: items.map((i) => ({ ...i, line_total_nok: Number(i.line_total_nok) })),
    subtotal: Number(o.subtotal_nok),
    discount: Number(o.discount_nok),
    memberTier: o.member_tier,
    shipping: Number(o.shipping_nok),
    total: Number(o.total_nok),
    delivery: o.delivery,
    address: o.address,
    postalCode: o.postal_code,
    city: o.city,
    payment: o.payment_method,
    orderUrl: orderUrl(o.id, o.access_token),
  };
  try {
    await sendOrderConfirmation(o.email, mail);
  } catch {
    /* beste innsats */
  }
  try {
    const svc = createServiceClient();
    const { data: cfg } = await svc.from("settings").select("value").eq("key", "booking_notify").maybeSingle();
    const extra = ((cfg?.value ?? null) as { email?: string } | null)?.email?.trim() ?? "";
    const to = Array.from(new Set([CONTACT_INBOX, extra].map((x) => x.toLowerCase()).filter((x) => x.includes("@"))));
    for (const addr of to) {
      await sendOrderAlert(addr, { ...mail, email: o.email, phone: o.phone, kasseUrl: `${siteUrl()}/kasse/nettordrer` });
    }
  } catch {
    /* beste innsats */
  }
}

/** Vipps/kort er godkjent (reservert). Idempotent – e-post sendes bare første gang. */
export async function markOrderAuthorized(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const svc = createServiceClient();
  const { data } = await svc
    .from("online_orders")
    .update({ payment_status: "authorized", confirmed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("payment_status", "pending")
    .select("id");
  if (data && data.length > 0) await sendOrderEmails(id);
}

/** Avbrutt/utløpt betaling: avbryt ordren og legg varene tilbake. */
async function markOrderFailed(id: string): Promise<void> {
  const svc = createServiceClient();
  await svc.rpc("cancel_online_order", { p_order: id });
  await svc.from("online_orders").update({ payment_status: "failed" }).eq("id", id).eq("status", "cancelled");
}

/**
 * Sjekk betalingen når kunden kommer tilbake fra Vipps (ordresiden).
 * Returnerer oppdatert betalingsstatus.
 */
export async function syncOrderPayment(id: string): Promise<string | null> {
  const svc = createServiceClient();
  const { data: o } = await svc
    .from("online_orders")
    .select("payment_status, payment_method, vipps_reference, status")
    .eq("id", id)
    .maybeSingle();
  if (!o) return null;
  if (o.payment_method === "pay_at_pickup" || o.payment_status !== "pending" || !o.vipps_reference) {
    return o.payment_status as string;
  }
  try {
    const st = await getPaymentStatus(o.vipps_reference as string);
    if (st.state === "AUTHORIZED") {
      await markOrderAuthorized(id);
      return "authorized";
    }
    if (st.state === "ABORTED" || st.state === "EXPIRED" || st.state === "TERMINATED") {
      await markOrderFailed(id);
      return "failed";
    }
  } catch {
    /* prøv igjen senere */
  }
  return "pending";
}
