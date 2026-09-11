import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GDPR – persondata-eksport (innsyn/portabilitet).
 *   Samler alt vi har om én kunde som maskinlesbar JSON. Admin laster ned
 *   og overleverer til kunden ved forespørsel.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireRole(["admin"]);
  const { id } = await params;
  const sb = await createClient();

  const [{ data: customer }, { data: bookings }, { data: sales }, { data: ratings }] =
    await Promise.all([
      sb.from("customers").select("*").eq("id", id).maybeSingle(),
      sb
        .from("bookings")
        .select("id, start_at, end_at, status, price_nok, services(name), staff(full_name)")
        .eq("customer_id", id)
        .order("start_at", { ascending: false }),
      sb
        .from("sales")
        .select("id, sold_at, total_nok, payment_method, staff(full_name)")
        .eq("customer_id", id)
        .order("sold_at", { ascending: false }),
      sb
        .from("ratings")
        .select("id, stars, comment, created_at, staff(full_name)")
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
    ]);

  if (!customer) {
    return new Response("Fant ikke kunden.", { status: 404 });
  }

  const payload = {
    eksportert: new Date().toISOString(),
    kilde: "Downtown Barbers",
    beskrivelse:
      "Persondata-eksport (GDPR art. 15/20). Inneholder alle registrerte opplysninger om kunden.",
    kunde: customer,
    bookinger: bookings ?? [],
    salg: sales ?? [],
    vurderinger: ratings ?? [],
  };

  const safe = String((customer as { full_name?: string }).full_name || "kunde")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase();
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="downtown_persondata_${safe}.json"`,
    },
  });
}
