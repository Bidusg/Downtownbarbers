import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { OnlineOrders } from "@/components/kasse/OnlineOrders";
import { OrderDetail } from "@/components/kasse/OrderDetail";
import { getOnlineOrder, getOnlineOrders, getPickableProducts } from "@/lib/online-order-queries";

/** Nettordrer – samme side i kassa (/kasse/nettordrer) og admin (/admin/nettordrer). */
export async function OnlineOrdersPage({ className, basePath, search = "" }: { className: string; basePath: string; search?: string }) {
  const { rows, ready, pickingReady } = await getOnlineOrders(search);
  return (
    <div className={className}>
      <PageHeader
        title="Nettordrer"
        description="Bestillinger fra nettbutikken. Start plukking og skann hver vare inn på ordren (eller trykk +). Når alt er plukket: «Klar til henting» (kunden får e-post). «Utlevert» eller «Sendt» trekker Vipps-beløpet og registrerer salget. Åpne en ordre for å endre den eller registrere retur, reklamasjon eller bytte."
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
          <OnlineOrders
            key={search + rows.map((r) => r.id + r.status).join(",")}
            rows={rows}
            pickingReady={pickingReady}
            basePath={basePath}
            search={search}
          />
        </>
      )}
    </div>
  );
}

/** Én ordre: plukking, endring, retur og historikk. */
export async function OnlineOrderDetailPage({
  className,
  basePath,
  id,
  customerBase,
}: {
  className: string;
  basePath: string;
  id: string;
  /** «/admin/kunder» – lenke til kundekortet (bare i admin). */
  customerBase?: string;
}) {
  const [{ order, events, features }, products] = await Promise.all([getOnlineOrder(id), getPickableProducts()]);
  if (!order) notFound();
  return (
    <div className={className}>
      <PageHeader title={`Ordre #${order.order_no}`} description={`${order.name} · ${order.email}`} />
      <OrderDetail
        o={order}
        events={events}
        features={features}
        products={products}
        basePath={basePath}
        customerHref={customerBase && order.customer_id ? `${customerBase}/${order.customer_id}` : null}
      />
    </div>
  );
}
