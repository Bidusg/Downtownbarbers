import { requireRole } from "@/lib/auth";
import { resolveRange } from "@/lib/report-queries";
import { buildSaftXml } from "@/lib/saft";

/**
 * SAF-T Financial (Regnskap) v1.30 – XML-eksport for revisor.
 * GET /revisor/eksport/saft?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Standard: inneværende måned.
 */
export async function GET(req: Request) {
  await requireRole(["revisor", "admin"]);
  const url = new URL(req.url);
  const r = resolveRange(
    url.searchParams.get("from") ?? undefined,
    url.searchParams.get("to") ?? undefined,
  );
  const xml = await buildSaftXml(r);
  const name = `SAF-T_Financial_${r.from}_${r.to}.xml`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
