import { requireRole } from "@/lib/auth";
import { getSalaryReports } from "@/lib/salary/report";
import { renderSalaryReportPdf } from "@/lib/pdf/lonnsrapport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Samlet lønnsrapport (PDF) for en måned.
 *   ?year=2026&month=10&staff=all            → alle
 *   ?year=2026&month=10&staff=id1,id2,…      → valgte ansatte
 */
export async function GET(req: Request) {
  await requireRole(["admin", "revisor"]);
  const url = new URL(req.url);
  const now = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" }).split("-").map(Number);
  const year = Number(url.searchParams.get("year")) || now[0];
  const m = Number(url.searchParams.get("month"));
  const month = m >= 1 && m <= 12 ? m : now[1];
  const raw = (url.searchParams.get("staff") ?? "all").trim();
  const ids =
    raw === "" || raw === "all"
      ? null
      : raw
          .split(",")
          .map((x) => x.trim())
          .filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (ids && ids.length === 0) {
    return new Response("Ingen gyldige ansatte valgt.", { status: 400 });
  }

  const entries = await getSalaryReports(year, month, ids);
  if (entries.length === 0) {
    return new Response("Fant ingen ansatte for perioden.", { status: 404 });
  }
  const buf = await renderSalaryReportPdf({ year, month, entries });
  const mm = String(month).padStart(2, "0");
  // Filnavn må være ASCII i HTTP-header (æ/ø/å og aksenter fjernes).
  const ascii = (t: string) =>
    t
      .replace(/æ/gi, "ae")
      .replace(/ø/gi, "o")
      .replace(/å/gi, "a")
      .normalize("NFD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const who = entries.length === 1 ? `_${ascii(entries[0].name)}` : "";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="lonnsrapport_${year}-${mm}${who}.pdf"`,
    },
  });
}
