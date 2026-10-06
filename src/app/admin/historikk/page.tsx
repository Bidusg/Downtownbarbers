import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { getHistoricalRevenueByDate } from "@/lib/historical-revenue";
import { HistoryImporter } from "@/components/admin/HistoryImporter";
import { HistoryTable } from "@/components/admin/HistoryTable";

export const dynamic = "force-dynamic";

export default async function AdminHistorikk() {
  const sb = await createClient();
  const [staffRes, rows] = await Promise.all([
    // Også tidligere ansatte (inaktive) – historikken kan gjelde dem.
    sb.from("staff").select("id, full_name, active").order("active", { ascending: false }).order("full_name"),
    getHistoricalRevenueByDate("2000-01-01", "2100-01-01"),
  ]);
  const staff = (staffRes.data ?? []).map((s) => ({
    id: s.id as string,
    name: (s.full_name as string) + (s.active ? "" : " (sluttet)"),
  }));
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Historiske tall" />
      <Card>
        <h2 className="font-display text-lg font-bold">Importer fra gammelt kassesystem</h2>
        <p className="mt-1 text-sm text-muted">
          Last opp rapporten «Omsetning en ansatt» (PDF) – én per ansatt, gjerne flere om gangen.
          Månedstallene leses ut, du kontrollerer dem, og de lagres. Tallene vises deretter i
          Omsetning, Rapporter, Nøkkeltall, Måloppnåelse og Lønn (merket som importert).
          Laster du opp samme måned på nytt, blir den erstattet.
        </p>
        <HistoryImporter staff={staff} />
      </Card>
      <HistoryTable rows={rows} />
    </div>
  );
}
