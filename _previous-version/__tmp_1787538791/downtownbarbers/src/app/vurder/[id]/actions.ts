"use server";

import { createClient } from "@/lib/supabase/server";

export async function submitRating(
  bookingId: string,
  stars: number,
  comment: string,
): Promise<{ ok?: true; error?: string }> {
  if (stars < 1 || stars > 5) return { error: "Velg mellom 1 og 5 stjerner." };
  try {
    const sb = await createClient();
    const { error } = await sb.rpc("rate_booking", {
      p_booking: bookingId,
      p_stars: stars,
      p_comment: comment,
    });
    if (error) return { error: "Kunne ikke lagre vurderingen." };
    return { ok: true };
  } catch {
    return { error: "Noe gikk galt." };
  }
}
