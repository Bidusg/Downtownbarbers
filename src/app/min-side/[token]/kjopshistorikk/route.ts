import { createServiceClient } from "@/lib/supabase/service";
import {
  renderPurchaseHistoryPdf,
  type PurchaseHistoryData,
} from "@/lib/pdf/purchase-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Kundens egen kjøpshistorikk som PDF – token-gated (samme portal-token som
 * /min-side/[token]). Kunden er ikke innlogget, så vi slår opp via service-role
 * (customers har RLS admin/shop). Returnerer KUN data for kunden token peker på.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return new Response("Ugyldig lenke.", { status: 404 });
  }

  const svc = createServiceClient();
  const { data: c } = await svc
    .from("customers")
    .select("id, full_name, phone, email, category, created_at")
    .eq("portal_token", token)
    .maybeSingle();
  if (!c) return new Response("Fant ikke kunden.", { status: 404 });

  const { data: bkRaw } = await svc
    .from("bookings")
    .select("id, start_at, status, price_nok, services(name), staff(full_name)")
    .eq("customer_id", c.id as string)
    .order("start_at", { ascending: false });

  const bookings = ((bkRaw ?? []) as {
    id: string;
    start_at: string;
    status: string;
    price_nok: number;
    services: { name?: string } | null;
    staff: { full_name?: string } | null;
  }[]).map((r) => ({
    id: r.id,
    start_at: r.start_at,
    status: r.status,
    price_nok: Number(r.price_nok) || 0,
    service: r.services?.name ?? "—",
    barber: r.staff?.full_name ?? "—",
  }));

  const completed = bookings.filter((b) => b.status === "completed");
  const data: PurchaseHistoryData = {
    full_name: (c.full_name as string) ?? "Kunde",
    phone: (c.phone as string) ?? null,
    email: (c.email as string) ?? null,
    category: (c.category as string) ?? null,
    created_at: (c.created_at as string) ?? new Date().toISOString(),
    visits: completed.length,
    totalSpent: completed.reduce((a, b) => a + b.price_nok, 0),
    noShows: bookings.filter((b) => b.status === "no_show").length,
    lastVisit: completed[0]?.start_at ?? null,
    bookings,
  };

  const buf = await renderPurchaseHistoryPdf(data);
  const safe = (data.full_name || "kunde").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="downtown_kjopshistorikk_${safe}.pdf"`,
    },
  });
}
