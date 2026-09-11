import { requireRole } from "@/lib/auth";
import { getCustomer } from "@/lib/admin-queries";
import { renderPurchaseHistoryPdf } from "@/lib/pdf/purchase-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireRole(["admin"]);
  const { id } = await params;
  const c = await getCustomer(id);
  if (!c) return new Response("Fant ikke kunden.", { status: 404 });

  const buf = await renderPurchaseHistoryPdf(c);
  const safe = (c.full_name || "kunde").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="downtown_kjopshistorikk_${safe}.pdf"`,
    },
  });
}
