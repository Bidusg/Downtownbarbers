// Shop-innstillinger (feature-flags) + eier-tilgang.
//
// Flaggene styrer funksjoner som kan misbrukes og derfor skal kunne skrus
// av/på fra admin. En EIER (profiles.is_owner) omgår begrensningene – flaggene
// gjelder ikke for eieren i shop.
//
// Lagres som JSON under settings-nøkkelen 'shop_flags' (admin skriver).

import { createClient } from "@/lib/supabase/server";

export type ShopFlags = {
  /** Rabatt tilgjengelig i kassen. */
  discountEnabled: boolean;
  /** Dra-for-lengde på bookinger (fremtidig funksjon). */
  dragLengthEnabled: boolean;
  /** Drop-in/hurtigsalg uten registrert kunde tillatt. */
  dropinWithoutCustomerEnabled: boolean;
  /** Venn/familie-rabatt tilgjengelig. */
  familyFriendDiscountEnabled: boolean;
  /** Sats for venn/familie-rabatt i prosent (0–100). */
  familyFriendDiscountPct: number;
};

export const DEFAULT_SHOP_FLAGS: ShopFlags = {
  discountEnabled: true,
  dragLengthEnabled: false,
  dropinWithoutCustomerEnabled: true,
  familyFriendDiscountEnabled: false,
  familyFriendDiscountPct: 100,
};

const SETTINGS_KEY = "shop_flags";

function coerce(raw: unknown): ShopFlags {
  const v = (raw ?? {}) as Partial<ShopFlags>;
  return {
    discountEnabled: v.discountEnabled ?? DEFAULT_SHOP_FLAGS.discountEnabled,
    dragLengthEnabled:
      v.dragLengthEnabled ?? DEFAULT_SHOP_FLAGS.dragLengthEnabled,
    dropinWithoutCustomerEnabled:
      v.dropinWithoutCustomerEnabled ??
      DEFAULT_SHOP_FLAGS.dropinWithoutCustomerEnabled,
    familyFriendDiscountEnabled:
      v.familyFriendDiscountEnabled ??
      DEFAULT_SHOP_FLAGS.familyFriendDiscountEnabled,
    familyFriendDiscountPct: Math.max(
      0,
      Math.min(
        100,
        Math.round(
          Number(
            v.familyFriendDiscountPct ??
              DEFAULT_SHOP_FLAGS.familyFriendDiscountPct,
          ),
        ),
      ),
    ),
  };
}

/** Les gjeldende shop-flagg (fyller inn standarder for det som mangler). */
export async function getShopFlags(): Promise<ShopFlags> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();
    return coerce(data?.value);
  } catch {
    return { ...DEFAULT_SHOP_FLAGS };
  }
}

/** Er innlogget bruker eier (Dawit)? */
export async function currentUserIsOwner(): Promise<boolean> {
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return false;
    const { data } = await sb
      .from("profiles")
      .select("is_owner")
      .eq("id", user.id)
      .maybeSingle();
    return !!data?.is_owner;
  } catch {
    return false;
  }
}

export type ShopAccess = {
  flags: ShopFlags;
  isOwner: boolean;
  /** Effektive rettigheter (flagg ELLER eier). */
  canDiscount: boolean;
  canDropinWithoutCustomer: boolean;
  canFamilyFriendDiscount: boolean;
  canDragLength: boolean;
};

/** Samlet tilgang for shop: flagg + eier-bypass. Én kilde til sannhet i UI. */
export async function getShopAccess(): Promise<ShopAccess> {
  const [flags, isOwner] = await Promise.all([
    getShopFlags(),
    currentUserIsOwner(),
  ]);
  return {
    flags,
    isOwner,
    canDiscount: flags.discountEnabled || isOwner,
    canDropinWithoutCustomer: flags.dropinWithoutCustomerEnabled || isOwner,
    canFamilyFriendDiscount: flags.familyFriendDiscountEnabled || isOwner,
    canDragLength: flags.dragLengthEnabled || isOwner,
  };
}
