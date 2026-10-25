import { PageHeader } from "@/components/ui/PageHeader";
import { OnlineOrders } from "@/components/kasse/OnlineOrders";
import { getOnlineOrders } from "@/lib/online-order-queries";

export const dynamic = "force-dynamic";

export default async function KasseNettordrer() {
  const { rows, ready, pickingReady } = await getOnlineOrders();
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
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
