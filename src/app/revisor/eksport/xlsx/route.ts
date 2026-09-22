import { requireRole } from "@/lib/auth";
import { resolveRange } from "@/lib/report-queries";
import { buildSalesWorkbook } from "@/lib/xlsx/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Salg for en periode som pen Excel (.xlsx): sammendrag + detaljerte salg. */
export async function GET(req: Request) {
  await requireRole(["revisor", "admin"]);
  const url = new URL(req.url);
  const r = resolveRange(
    url.searchParams.get("from") ?? undefined,
    url.searchParams.get("to") ?? undefined,
  );
  const buf = await buildSalesWorkbook(r);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="downtown_salg_${r.from}_${r.to}.xlsx"`,
    },
  });
}
