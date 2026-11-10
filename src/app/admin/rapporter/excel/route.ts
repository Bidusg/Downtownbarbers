import { getUserRole, isAdminRole } from "@/lib/auth";
import { resolveRange } from "@/lib/report-queries";
import { createClient } from "@/lib/supabase/server";
import { findReports } from "@/lib/reports/registry";
import type { ReportSheet } from "@/lib/reports/types";
import { renderReportWorkbook } from "@/lib/xlsx/report-theme";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* Rapportsenter: ÉN Excel-fil med valgte rapporter.
 *   GET ?r=nokkel1,nokkel2&from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: Request) {
  const me = await getUserRole();
  if (!me) return new Response("Du må logge inn.", { status: 401 });
  if (!isAdminRole(me.role)) return new Response("Ingen tilgang.", { status: 403 });

  const url = new URL(req.url);
  const keys = (url.searchParams.get("r") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (keys.length === 0) {
    return new Response("Velg minst én rapport.", { status: 400 });
  }
  const reports = findReports(keys);
  if (reports.length === 0) {
    return new Response("Fant ingen av de valgte rapportene.", { status: 400 });
  }

  const range = resolveRange(
    url.searchParams.get("from") ?? undefined,
    url.searchParams.get("to") ?? undefined,
  );
  const sb = await createClient();

  // Bygg rapportene etter rekkefølgen i registeret; én som feiler stopper ikke resten.
  const groups = await Promise.all(
    reports.map(async (rep) => {
      let sheets: ReportSheet[];
      try {
        sheets = await rep.build({ range, sb });
      } catch (e) {
        const msg = e instanceof Error && e.message ? e.message : "ukjent feil";
        sheets = [
          {
            name: rep.title,
            title: rep.title,
            subtitle: `Rapporten kunne ikke lages: ${msg}`,
            tables: [],
          },
        ];
      }
      return { report: { title: rep.title, category: rep.category }, sheets };
    }),
  );

  const buf = await renderReportWorkbook({
    title: reports.length === 1 ? reports[0].title : "Rapportpakke",
    periodLabel: range.label,
    from: range.from,
    to: range.to,
    generatedBy: me.email ?? undefined,
    sheets: groups,
  });

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="downtownbarbers-rapport-${range.from}-${range.to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
