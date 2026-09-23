"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { asStaffLevel } from "@/lib/levels";

export type LevelCellInput = {
  level: string;
  /** Tom streng = ingen nivåpris (fall tilbake til grunnpris). */
  price: string;
  /** Tom streng = bruk tjenestens grunnvarighet. */
  duration: string;
};

/**
 * Lagrer en hel rad (alle nivåer for én tjeneste). Tom pris → sletter
 * nivåraden (fallback til grunnpris). Kun admin.
 */
export async function saveServiceLevelPrices(
  serviceId: string,
  rows: LevelCellInput[],
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin"]);
  if (!serviceId) return { error: "Mangler tjeneste." };
  const sb = await createClient();

  const toUpsert: {
    service_id: string;
    level: string;
    price_nok: number;
    duration_min: number | null;
    updated_at: string;
  }[] = [];
  const toDelete: string[] = [];

  for (const r of rows) {
    const level = asStaffLevel(r.level);
    const priceStr = r.price.trim().replace(/\s/g, "").replace(",", ".");
    if (priceStr === "") {
      toDelete.push(level);
      continue;
    }
    const price = Number(priceStr);
    if (Number.isNaN(price) || price < 0) {
      return { error: `Ugyldig pris for ${level}.` };
    }
    const durStr = r.duration.trim();
    let duration: number | null = null;
    if (durStr !== "") {
      const d = parseInt(durStr, 10);
      if (Number.isNaN(d) || d <= 0) {
        return { error: `Ugyldig varighet for ${level}.` };
      }
      duration = d;
    }
    toUpsert.push({
      service_id: serviceId,
      level,
      price_nok: price,
      duration_min: duration,
      updated_at: new Date().toISOString(),
    });
  }

  if (toUpsert.length > 0) {
    const { error } = await sb
      .from("service_level_prices")
      .upsert(toUpsert, { onConflict: "service_id,level" });
    if (error) return { error: `Kunne ikke lagre: ${error.message}` };
  }
  if (toDelete.length > 0) {
    const { error } = await sb
      .from("service_level_prices")
      .delete()
      .eq("service_id", serviceId)
      .in("level", toDelete);
    if (error) return { error: `Kunne ikke rydde: ${error.message}` };
  }

  revalidatePath("/admin/priser");
  return { ok: true };
}
