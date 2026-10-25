import { PageHeader } from "@/components/ui/PageHeader";
import { OnlineOrders } from "@/components/kasse/OnlineOrders";
import { getOnlineOrders } from "@/lib/online-order-queries";

export const dynamic = "force-dynamic";

export default async function KasseNettordrer() {
  const { rows, ready } = await getOnlineOrders();
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Nettordrer"
        description="Bestillinger fra nettbutikken. Plukk varene, trykk «Klar til henting» (kunden får e-post), og «Utlevert» eller «Sendt» når kunden har fått dem – da trekkes Vipps-beløpet og salget registreres."
      />
      {!ready ? (
        <p className="bo-card border border-line bg-surface p-5 text-sm text-danger">Kjør KJØR-I-SUPABASE-NETTBUTIKK.sql i Supabase først.</p>
      ) : (
        <OnlineOrders key={rows.map((r) => r.id + r.status).join(",")} rows={rows} />
      )}
    </div>
  );
}
