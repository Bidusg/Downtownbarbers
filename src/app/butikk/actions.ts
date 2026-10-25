"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCustomerToken } from "@/lib/customer-session";
import { createPayment } from "@/lib/vipps";
import { isValidEmail } from "@/lib/validate";
import { ipRateLimited, isHoneypotTripped } from "@/lib/abuse-guard";
import { canPreviewShop, getWebshopSettings } from "@/lib/shop";
import { orderUrl, sendOrderEmails } from "@/lib/shop-orders";

/* =====================================================================
 * NETTBUTIKK – legg inn ordre.
 *   Databasen (create_online_order) avgjør pris, lager, frakt og
 *   kundeklubb-rabatt. Vipps/kort: kunden sendes til Vipps, beløpet
 *   reserveres og trekkes ved utlevering. Betal ved henting: ferdig.
 * ===================================================================== */

export type PlaceOrderInput = {
  items: { id: string; qty: number }[];
  name: string;
  email: string;
  phone: string;
  delivery: "pickup" | "ship";
  address?: string;
  postalCode?: string;
  city?: string;
  payment: "vipps" | "card" | "pay_at_pickup";
  note?: string;
  acceptTerms: boolean;
  website?: string; // honeypot
};

export type PlaceOrderResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string; outOfStock?: string };

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  if (isHoneypotTripped(input.website)) return { ok: false, error: "Noe gikk galt. Prøv igjen." };
  if (await ipRateLimited()) return { ok: false, error: "For mange forsøk. Vent litt og prøv igjen." };

  const cfg = await getWebshopSettings();
  if (!cfg.live && !(await canPreviewShop())) return { ok: false, error: "Nettbutikken er ikke åpnet ennå." };
  if (!input.acceptTerms) return { ok: false, error: "Du må godta kjøpsvilkårene." };
  if (!input.name?.trim() || input.name.trim().length < 2) return { ok: false, error: "Skriv inn navnet ditt." };
  if (!isValidEmail(input.email ?? "")) return { ok: false, error: "Skriv inn en gyldig e-postadresse." };
  if (!input.items?.length) return { ok: false, error: "Handlekurven er tom." };
  if (input.delivery === "ship" && !cfg.ship) return { ok: false, error: "Sending er ikke tilgjengelig akkurat nå." };
  if (input.delivery === "pickup" && !cfg.pickup) return { ok: false, error: "Henting er ikke tilgjengelig akkurat nå." };
  if (input.payment === "card" && !cfg.card) return { ok: false, error: "Kortbetaling er ikke slått på ennå." };
  if (input.payment === "pay_at_pickup" && (!cfg.payAtPickup || input.delivery !== "pickup"))
    return { ok: false, error: "«Betal ved henting» gjelder bare henting i salongen." };

  const token = await getCustomerToken();
  const sb = await createClient();
  const { data, error } = await sb.rpc("create_online_order", {
    p_items: input.items.slice(0, 50).map((i) => ({ id: i.id, qty: Math.max(1, Math.min(20, Math.floor(i.qty || 1))) })),
    p_customer: { name: input.name.trim(), email: input.email.trim(), phone: (input.phone ?? "").trim() },
    p_delivery: input.delivery,
    p_address:
      input.delivery === "ship"
        ? { address: input.address ?? "", postal_code: (input.postalCode ?? "").trim(), city: input.city ?? "" }
        : null,
    p_payment: input.payment,
    p_token: token,
    p_note: (input.note ?? "").slice(0, 500) || null,
  });
  if (error) {
    const m = error.message ?? "";
    const oos = m.match(/OUT_OF_STOCK:(.+)$/);
    if (oos) return { ok: false, error: `Det er ikke nok igjen av «${oos[1]}». Endre antallet og prøv igjen.`, outOfStock: oos[1] };
    if (/BAD_ADDRESS/.test(m)) return { ok: false, error: "Sjekk adressen – postnummeret må ha fire siffer." };
    if (/NOT_FOUND/.test(m)) return { ok: false, error: "Et av produktene er ikke lenger tilgjengelig. Oppdater handlekurven." };
    if (/function|schema/i.test(m)) return { ok: false, error: "Nettbutikken er ikke åpnet ennå." };
    return { ok: false, error: "Kunne ikke lage ordren. Prøv igjen, eller ring oss." };
  }

  const d = data as { id: string; order_no: number; token: string; total_nok: number };
  const back = orderUrl(d.id, d.token);

  if (input.payment === "pay_at_pickup") {
    await sendOrderEmails(d.id);
    return { ok: true, redirectUrl: back };
  }

  // Vipps / kort via Vipps: reserver beløpet.
  try {
    const reference = `web-${d.id}`;
    const res = await createPayment({
      bookingId: d.id,
      reference,
      amountOre: Math.round(Number(d.total_nok) * 100),
      description: `Downtown Barbers – ordre #${d.order_no}`,
      returnUrl: back,
      paymentMethod: input.payment === "card" ? "CARD" : "WALLET",
    });
    await createServiceClient().from("online_orders").update({ vipps_reference: reference }).eq("id", d.id);
    return { ok: true, redirectUrl: res.redirectUrl || back };
  } catch {
    // Betalingen kunne ikke startes: avbryt ordren og legg varene tilbake.
    try {
      await createServiceClient().rpc("cancel_online_order", { p_order: d.id });
    } catch {
      /* noop */
    }
    return { ok: false, error: "Vi fikk ikke startet betalingen. Prøv igjen, eller velg en annen betalingsmåte." };
  }
}
