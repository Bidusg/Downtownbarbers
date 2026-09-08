import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function cell(v: string | number | null): string {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET() {
  await requireRole(["revisor", "admin"]);
  const sb = await createClient();
  const { data } = await sb
    .from("sales")
    .select("sold_at, total_nok, payment_method, staff(full_name), customers(full_name)")
    .order("sold_at", { ascending: false })
    .limit(50000);

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
  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="downtown_salg_${today}.csv"`,
    },
  });
}
