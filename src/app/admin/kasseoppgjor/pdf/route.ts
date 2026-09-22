import { requireRole } from "@/lib/auth";
import { getDailyReconciliation } from "@/lib/ops-queries";
import { renderSettlementPdf } from "@/lib/pdf/kasseoppgjor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function osloToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
}

/** Kasseoppgjør dag-for-dag som pen PDF for en periode (from..to, inkl.). */
export async function GET(req: Request) {
  await requireRole(["admin"]);
  const url = new URL(req.url);
  const to = DATE_RE.test(url.searchParams.get("to") ?? "")
    ? (url.searchParams.get("to") as string)
    : osloToday();
  const fromParam = url.searchParams.get("from");
  const from = DATE_RE.test(fromParam ?? "") ? (fromParam as string) : to;

  // Antall dager i vinduet (inkl. begge ender), begrenset for en fornuftig PDF.
  const dTo = new Date(`${to}T00:00:00.000Z`);
  const dFrom = new Date(`${from}T00:00:00.000Z`);
  const days = Math.min(
    Math.max(Math.round((dTo.getTime() - dFrom.getTime()) / 86400000) + 1, 1),
    186,
  );

  const rows = await getDailyReconciliation(to, days);
  const buf = await renderSettlementPdf({ from, to, rows });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="downtown_kasseoppgjor_${from}_${to}.pdf"`,
    },
  });
}
