import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function cell(v: string | number | null): string {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

/* Oslo lokal midnatt (UTC-instant) for korrekt dags-avgrensning. */
function tzOffsetMs(instant: number, tz: string): number {
  const d = new Date(instant);
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const loc = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  return loc.getTime() - utc.getTime();
}
function osloMidnight(y: number, m: number, d: number): string {
  const base = Date.UTC(y, m - 1, d);
  return new Date(base - tzOffsetMs(base, "Europe/Oslo")).toISOString();
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  await requireRole(["revisor", "admin"]);
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const sb = await createClient();

  let q = sb
    .from("sales")
    .select("sold_at, total_nok, payment_method, staff(full_name), customers(full_name)")
    .order("sold_at", { ascending: false })
    .limit(50000);

  // Valgfri periode-avgrensning (yyyy-mm-dd, begge inklusive) for perioderapport.
  if (from && DATE_RE.test(from)) {
    const [y, m, d] = from.split("-").map(Number);
    q = q.gte("sold_at", osloMidnight(y, m, d));
  }
  if (to && DATE_RE.test(to)) {
    const [y, m, d] = to.split("-").map(Number);
    q = q.lt("sold_at", osloMidnight(y, m, d + 1)); // t.o.m. hele slutt-dagen
  }

  const { data } = await q;

  const header = ["Dato", "Barber", "Kunde", "Beløp (kr)", "Betalingsmåte"];
  const lines = [header.map(cell).join(";")];

  for (const s of data ?? []) {
    const st = s.staff as { full_name?: string } | null;
    const c = s.customers as { full_name?: string } | null;
    let dato = "";
    try {
      dato = new Date(s.sold_at as string).toLocaleString("nb-NO", {
        timeZone: "Europe/Oslo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      dato = String(s.sold_at ?? "");
    }
    lines.push(
      [
        cell(dato),
        cell(st?.full_name ?? ""),
        cell(c?.full_name ?? ""),
        cell(Math.round(Number(s.total_nok) || 0)),
        cell((s.payment_method as string) ?? ""),
      ].join(";"),
    );
  }

  // BOM for korrekt æøå i Excel
  const csv = "﻿" + lines.join("\r\n");
  const suffix =
    from && DATE_RE.test(from) && to && DATE_RE.test(to)
      ? `${from}_${to}`
      : new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="downtown_salg_${suffix}.csv"`,
    },
  });
}
