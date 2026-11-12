import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { getShopContext } from "@/lib/shop-settings";

/** Eldste dag (antall dager tilbake) kassa får etterregistrere et salg på. */
export const MAX_BACKDATE_DAYS = 31;

function osloDayOf(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
}

/**
 * Rabatt-flagg (type-bevisst): venn/familie-rabatt krever at venn/familie er
 * på; fri rabatt krever at fri rabatt er på. Eier/admin omgår. Delt mellom
 * completeBooking og Vipps-flyten, så Vipps ikke trekker penger for et salg
 * som likevel ville blitt avvist.
 */
export async function checkDiscountRules(
  discountNok: number,
  relationType?: string,
): Promise<{ error?: string; ffEnabled: boolean }> {
  const { flags, canBypass } = await getShopContext();
  const ffEnabled = canBypass || flags.friend_family_discount_enabled;
  const freeEnabled = canBypass || flags.discount_enabled;
  if (discountNok > 0) {
    const ok = relationType ? ffEnabled : freeEnabled;
    if (!ok) {
      return {
        ffEnabled,
        error: relationType
          ? "Venn/familie-rabatt er slått av for kassa."
          : "Rabatt er slått av for kassa.",
      };
    }
  }
  return { ffEnabled };
}

/**
 * Kan et salg etterregistreres på denne dagen (yyyy-mm-dd, Oslo)?
 * - Ikke eldre enn 31 dager (gjelder alle).
 * - Ikke på en dag som allerede er gjort opp (kasseoppgjør) – unntatt admin/eier.
 * Ved feil i oppgjørssjekken nektes etterregistreringen (trygt).
 */
export async function checkBackdate(osloDate: string): Promise<{ error?: string }> {
  const today = osloDayOf(new Date());
  if (osloDate >= today) return {};

  const limit = osloDayOf(new Date(Date.now() - MAX_BACKDATE_DAYS * 86_400_000));
  if (osloDate < limit) {
    return {
      error: `Salg kan ikke etterregistreres mer enn ${MAX_BACKDATE_DAYS} dager tilbake.`,
    };
  }

  const me = await getUserRole();
  if (me && isAdminRole(me.role)) return {};

  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("cash_settlements")
      .select("id")
      .eq("settle_date", osloDate)
      .limit(1);
    if (error) throw error;
    if ((data ?? []).length > 0) {
      return {
        error:
          "Dagen er allerede gjort opp – salget kan ikke etterregistreres. Be admin om hjelp.",
      };
    }
  } catch (e) {
    console.error("checkBackdate: kunne ikke sjekke kasseoppgjør", e);
    return {
      error: "Kunne ikke sjekke om dagen er gjort opp – prøv igjen. Ingenting er lagret.",
    };
  }
  return {};
}
