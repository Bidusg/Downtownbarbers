import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";

/**
 * Shop-innstillinger (feature-flags). Ett sted styrer av/på for funksjoner i
 * kassa som kan misbrukes. Lagres i settings-nøkkelen 'shop_flags' (jsonb) og
 * leses via get_shop_flags() (security definer – kassa/shop kan lese uten
 * direkte tilgang til settings-tabellen). Bygget som én gjenbrukbar struktur:
 * en ny bryter = ett felt her + én rad i admin-panelet.
 */
export type ShopFlags = {
  /** Fri rabatt (kr) i kassa. */
  discount_enabled: boolean;
  /** Egen «venn/familie»-rabattknapp med fast prosentsats. */
  friend_family_discount_enabled: boolean;
  /** Prosentsats for venn/familie-rabatt. */
  friend_family_discount_pct: number;
  /** Tillat hurtigsalg/drop-in uten å registrere kunde. */
  dropin_without_customer_enabled: boolean;
  /** Dra-for-lengde i kalender (endre varighet ved å dra nederst på timen). */
  drag_for_length_enabled: boolean;
  /** Flytte en time til ny tid ved å dra den opp/ned i kalenderen. */
  move_booking_enabled: boolean;
  /** Flytte en kunde til en annen barber ved å dra timen sidelengs. */
  transfer_booking_enabled: boolean;
  /** Booke ny time ved å trykke i et ledig felt i kalenderen. */
  manual_booking_enabled: boolean;
  /** Blokkere/pause tid i kalenderen fra kassa. */
  block_times_enabled: boolean;
};

export const SHOP_FLAG_DEFAULTS: ShopFlags = {
  discount_enabled: true,
  friend_family_discount_enabled: false,
  friend_family_discount_pct: 20,
  dropin_without_customer_enabled: true,
  drag_for_length_enabled: false,
  // Flytte/booke er på i dag → default true (bevarer dagens oppførsel).
  move_booking_enabled: true,
  transfer_booking_enabled: true,
  manual_booking_enabled: true,
  // Blokkering var tidligere kun i admin → default av for kassa.
  block_times_enabled: false,
};

type BoolFlagKey =
  | "discount_enabled"
  | "friend_family_discount_enabled"
  | "dropin_without_customer_enabled"
  | "drag_for_length_enabled"
  | "move_booking_enabled"
  | "transfer_booking_enabled"
  | "manual_booking_enabled"
  | "block_times_enabled";

function coerceFlags(raw: unknown): ShopFlags {
  const v = (raw ?? {}) as Partial<Record<keyof ShopFlags, unknown>>;
  const bool = (k: BoolFlagKey): boolean =>
    typeof v[k] === "boolean" ? (v[k] as boolean) : SHOP_FLAG_DEFAULTS[k];
  const pct = Number(v.friend_family_discount_pct);
  return {
    discount_enabled: bool("discount_enabled"),
    friend_family_discount_enabled: bool("friend_family_discount_enabled"),
    friend_family_discount_pct:
      Number.isFinite(pct) && pct >= 0 && pct <= 100
        ? pct
        : SHOP_FLAG_DEFAULTS.friend_family_discount_pct,
    dropin_without_customer_enabled: bool("dropin_without_customer_enabled"),
    drag_for_length_enabled: bool("drag_for_length_enabled"),
    move_booking_enabled: bool("move_booking_enabled"),
    transfer_booking_enabled: bool("transfer_booking_enabled"),
    manual_booking_enabled: bool("manual_booking_enabled"),
    block_times_enabled: bool("block_times_enabled"),
  };
}

/** Leser gjeldende shop-flags (flettet mot standardverdier). */
export async function getShopFlags(): Promise<ShopFlags> {
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("get_shop_flags");
    return coerceFlags(data);
  } catch {
    return { ...SHOP_FLAG_DEFAULTS };
  }
}

/** Lagrer en delvis oppdatering av shop-flags. Kun admin/eier (RPC håndhever). */
export async function saveShopFlags(
  patch: Partial<ShopFlags>,
): Promise<{ ok?: true; error?: string }> {
  try {
    const sb = await createClient();
    const { error } = await sb.rpc("set_shop_flags", { p_patch: patch });
    if (error) return { error: error.message };
    return { ok: true };
  } catch {
    return { error: "Kunne ikke lagre innstillinger." };
  }
}

export type ShopContext = {
  role: string;
  /** Admin/eier omgår alle shop-begrensninger. */
  canBypass: boolean;
  flags: ShopFlags;
};

/**
 * Kontekst for kassa: rolle + flagg + om brukeren omgår begrensninger.
 * Eier (og admin) har ingen shop-begrensninger.
 */
export async function getShopContext(): Promise<ShopContext> {
  const [me, flags] = await Promise.all([getUserRole(), getShopFlags()]);
  const role = me?.role ?? "shop";
  return { role, canBypass: isAdminRole(role), flags };
}
