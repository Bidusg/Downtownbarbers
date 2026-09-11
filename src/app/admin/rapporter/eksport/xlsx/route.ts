import { requireRole } from "@/lib/auth";
import { resolveRange } from "@/lib/report-queries";
import { buildRegnskapWorkbook } from "@/lib/xlsx/regnskap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requireRole(["revisor", "admin"]);
  const url = new URL(req.url);
  const r = resolveRange(
    url.searchParams.get("from") ?? undefined,
    url.searchParams.get("to") ?? undefined,
  );
  const buf = await buildRegnskapWorkbook(r);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="downtown_regnskap_${r.from}_${r.to}.xlsx"`,
    },
  });
}
