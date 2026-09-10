import { requireRole } from "@/lib/auth";
import {
  resolveRange,
  getRevenueByGranularity,
  getRevenueBreakdown,
  getCategoryBreakdown,
  getVatReport,
  getSlowMovers,
  type Granularity,
} from "@/lib/report-queries";

function cell(v: string | number | null): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}
const kr = (n: number) => Math.round(n);

function csvResponse(name: string, lines: string[]) {
  const csv = "﻿" + lines.join("\r\n"); // BOM for æøå i Excel
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
    },
  });
}

export async function GET(req: Request) {
  await requireRole(["revisor", "admin"]);
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "omsetning";
  const r = resolveRange(
    url.searchParams.get("from") ?? undefined,
    url.searchParams.get("to") ?? undefined,
  );
  const suffix = `${r.from}_${r.to}`;

  if (type === "barber") {
    const b = await getRevenueBreakdown(r);
    const lines = [["Barber", "Omsetning (kr)"].map(cell).join(";")];
    for (const row of b.byBarber) lines.push([cell(row.name), cell(kr(row.nok))].join(";"));
    return csvResponse(`downtown_omsetning_per_barber_${suffix}`, lines);
  }

  if (type === "kategori") {
    const c = await getCategoryBreakdown(r);
    const lines = [["Kategori", "Antall", "Omsetning (kr)"].map(cell).join(";")];
    for (const row of c.rows) lines.push([cell(row.category), cell(row.count), cell(kr(row.nok))].join(";"));
    return csvResponse(`downtown_omsetning_per_kategori_${suffix}`, lines);
  }

  if (type === "mva") {
    const v = await getVatReport(r);
    const lines = [["Grunnlag", "Brutto (kr)", `Netto eks. ${v.rate}% (kr)`, "MVA (kr)"].map(cell).join(";")];
    const addRow = (label: string, x: { gross: number; net: number; vat: number }) =>
      lines.push([cell(label), cell(x.gross), cell(x.net), cell(x.vat)].join(";"));
    addRow("Tjenester (kasse)", v.services);
    addRow("Varesalg (Zettle)", v.external);
    addRow("Totalt", v.total);
    return csvResponse(`downtown_mva_${suffix}`, lines);
  }

  if (type === "hyllevarmere") {
    const rows = await getSlowMovers(r);
    const lines = [["Produkt", "På lager", "Solgt i perioden", "Pris (kr)"].map(cell).join(";")];
    for (const row of rows) lines.push([cell(row.name), cell(row.stock), cell(row.sold), cell(kr(row.price))].join(";"));
    return csvResponse(`downtown_hyllevarmere_${suffix}`, lines);
  }

  // Standard: omsetning over tid
  const g = (url.searchParams.get("g") ?? "day") as Granularity;
  const buckets = await getRevenueByGranularity(r, g);
  const lines = [["Periode", "Omsetning (kr)"].map(cell).join(";")];
  for (const row of buckets) lines.push([cell(row.label), cell(kr(row.nok))].join(";"));
  return csvResponse(`downtown_omsetning_${g}_${suffix}`, lines);
}
