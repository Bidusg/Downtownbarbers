"use server";

import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import {
  createPayment,
  getPaymentStatus,
  capturePayment,
} from "@/lib/vipps";
import { completeBooking, type SaleProduct } from "@/app/kasse/actions";

/* =====================================================================
 * VIPPS I KASSA – send en ekte Vipps-betalingsforespørsel til kunden
 *   (push til telefon ELLER QR på skjermen), og fullfør salget når den er
 *   godkjent. Hele summen (tjeneste + varer − rabatt) belastes.
 *
 *   Hvorfor polling og ikke webhook: den vanlige Vipps-webhooken håndterer
 *   kun nettbooking (booking-<id>). Kasse-betalinger bruker referansen
 *   kasse-<id>-… og styres herfra (status → capture → registrer salg), så
 *   vi unngår dobbel capture.
 *
 *   TRYGGHET:
 *   - Beløpet beregnes ALLTID server-side (tjenestepris + varepriser fra DB,
 *     minus rabatt klemt til [0, brutto]) – aldri fra klienten.
 *   - Medlems-kuponger støttes IKKE i denne flyten (de regnes med bivirkning
 *     i record_sale) – da brukes vanlig betaling i stedet. Dermed stemmer
 *     Vipps-beløpet nøyaktig med det salget som registreres.
 * ===================================================================== */

type ChargeOpts = {
  /** Produkter som selges sammen med timen. */
  products?: SaleProduct[];
  /** Fri/venn-familie-rabatt i kr (samme tall som i betalingsskjermen). */
  discountNok?: number;
};

type Role = string | null | undefined;
function isShopOrAdmin(role: Role): boolean {
  return role === "shop" || role === "admin" || role === "eier";
}

/** Beregn nettosum i øre – speiler record_sale (uten kupong). */
async function computeNetOre(
  bookingId: string,
  products: SaleProduct[],
  discountNok: number,
): Promise<{ ore: number; error?: string }> {
  const sb = await createClient();

  const { data: b } = await sb
    .from("bookings")
    .select("price_nok")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return { ore: 0, error: "Fant ikke timen." };
  let gross = Number(b.price_nok) || 0;

  const clean = (products ?? []).filter((p) => p && p.id);
  if (clean.length > 0) {
    const ids = clean.map((p) => p.id);
    const { data: prods } = await sb
      .from("products")
      .select("id, price_nok")
      .in("id", ids)
      .eq("active", true);
    const priceById = new Map(
      (prods ?? []).map((p) => [p.id as string, Number(p.price_nok) || 0]),
    );
    for (const p of clean) {
      const price = priceById.get(p.id);
      if (price == null) return { ore: 0, error: "Fant ikke produktet." };
      gross += price * Math.max(1, Math.floor(p.qty || 1));
    }
  }

  const discount = Math.min(Math.max(0, Math.round(discountNok || 0)), Math.round(gross));
  const net = Math.round(gross) - discount;
  return { ore: Math.round(net * 100) };
}

export type StartVippsResult = {
  reference?: string;
  /** QR-bilde (data/URL) for QR-flyten. Tomt for push. */
  qr?: string;
  mode?: "mock" | "test" | "production";
  amountNok?: number;
  error?: string;
};

/** Start en Vipps-betaling fra kassa (push til nummer eller QR). */
export async function startVippsCharge(
  bookingId: string,
  input: { method: "push" | "qr"; phone?: string } & ChargeOpts,
): Promise<StartVippsResult> {
  const me = await getUserRole();
  if (!me || !isShopOrAdmin(me.role)) return { error: "Ikke tilgang." };

  const phone = (input.phone ?? "").replace(/\s/g, "");
  if (input.method === "push" && !/^(\+?47)?\d{8}$/.test(phone)) {
    return { error: "Skriv inn et gyldig norsk mobilnummer for push." };
  }

  const { ore, error } = await computeNetOre(
    bookingId,
    input.products ?? [],
    input.discountNok ?? 0,
  );
  if (error) return { error };
  if (ore < 100) return { error: "Beløpet er for lavt for Vipps (minst 1 kr)." };

  // Unik referanse per forsøk (må være unik per MSN hos Vipps).
  const reference = `kasse-${bookingId}-${Date.now().toString(36)}`;

  try {
    const res = await createPayment({
      bookingId,
      amountOre: ore,
      description: "Downtown Barbers",
      userFlow: input.method === "push" ? "PUSH_MESSAGE" : "QR",
      phoneNumber: input.method === "push" ? phone : undefined,
      reference,
      customerPresent: true,
    });
    return {
      reference: res.reference,
      qr: input.method === "qr" ? res.redirectUrl : "",
      mode: res.mode,
      amountNok: Math.round(ore / 100),
    };
  } catch (e) {
    return {
      error:
        "Kunne ikke starte Vipps-betaling: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }
}

export type PollVippsResult = {
  status: "pending" | "paid" | "failed";
  error?: string;
};

/**
 * Sjekk Vipps-status. Ved AUTHORIZED: capture (trekk pengene) og registrer
 * salget med betalingsmåte «Vipps». Beløpet beregnes på nytt server-side.
 */
export async function pollVippsCharge(
  reference: string,
  bookingId: string,
  input: ChargeOpts & {
    customer?: { name?: string; email?: string; phone?: string };
    sendReceipt?: boolean;
  },
): Promise<PollVippsResult> {
  const me = await getUserRole();
  if (!me || !isShopOrAdmin(me.role)) return { status: "failed", error: "Ikke tilgang." };

  let state;
  try {
    ({ state } = await getPaymentStatus(reference));
  } catch (e) {
    return {
      status: "pending",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (state === "AUTHORIZED") {
    const { ore, error } = await computeNetOre(
      bookingId,
      input.products ?? [],
      input.discountNok ?? 0,
    );
    if (error) return { status: "failed", error };
    try {
      await capturePayment(reference, ore);
    } catch (e) {
      return {
        status: "failed",
        error:
          "Vipps bekreftet, men trekket (capture) feilet: " +
          (e instanceof Error ? e.message : String(e)),
      };
    }
    const res = await completeBooking(bookingId, {
      paymentMethod: "Vipps",
      products: input.products,
      discountNok: input.discountNok,
      customer: input.customer,
      sendReceipt: input.sendReceipt,
    });
    if (res?.error) {
      return {
        status: "failed",
        error:
          "Betalingen er trukket i Vipps, men salget ble ikke registrert: " +
          res.error,
      };
    }
    return { status: "paid" };
  }

  if (state === "ABORTED" || state === "EXPIRED" || state === "TERMINATED") {
    return {
      status: "failed",
      error:
        state === "EXPIRED"
          ? "Vipps-forespørselen utløp (ingen betaling innen tidsfristen)."
          : "Kunden avbrøt Vipps-betalingen.",
    };
  }

  return { status: "pending" };
}
