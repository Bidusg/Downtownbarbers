import { PageHeader } from "@/components/ui/PageHeader";
import { OnlineOrders } from "@/components/kasse/OnlineOrders";
import { getOnlineOrders } from "@/lib/online-order-queries";

/** Nettordrer – samme side i kassa (/kasse/nettordrer) og admin (/admin/nettordrer). */
export async function OnlineOrdersPage({ className }: { className: string }) {
  const { rows, ready, pickingReady } = await getOnlineOrders();
  return (
    <div className={className}>
      <PageHeader
        title="Nettordrer"
        description="Bestillinger fra nettbutikken. Start plukking og skann hver vare inn på ordren (eller trykk +). Mangler en vare på hylla, trykk «Mangler» – den tas ut og totalen regnes om. Når alt er plukket: «Klar til henting» (kunden får e-post). «Utlevert» eller «Sendt» trekker Vipps-beløpet og registrerer salget."
      />
      {!ready ? (
        <p className="bo-card border border-line bg-surface p-5 text-sm text-danger">Kjør KJØR-I-SUPABASE-NETTBUTIKK.sql i Supabase først.</p>
      ) : (
        <>
          {!pickingReady && (
            <p className="bo-card mb-4 border border-line bg-surface p-4 text-sm text-danger">
              Kjør KJØR-I-SUPABASE-NETTORDRE-PLUKK.sql i Supabase for å slå på plukking med skanning.
            </p>
          )}
          <OnlineOrders key={rows.map((r) => r.id + r.status).join(",")} rows={rows} pickingReady={pickingReady} />
        </>
      )}
    </div>
  );
}
