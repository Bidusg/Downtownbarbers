import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncOrderPayment } from "@/lib/shop-orders";
import { kr } from "@/lib/shop-shared";
import { salon } from "@/lib/data/salon";
import { OrderClient } from "@/components/shop/OrderClient";

export const metadata = { title: "Ordre | Downtown Barbers", robots: { index: false } };

type Order = {
  id: string;
  order_no: number;
  created_at: string;
  name: string;
  email: string;
  delivery: "pickup" | "ship";
  address: string | null;
  postal_code: string | null;
  city: string | null;
  subtotal_nok: number;
  discount_nok: number;
  shipping_nok: number;
  total_nok: number;
  member_tier: string | null;
  payment_method: "vipps" | "card" | "pay_at_pickup";
  payment_status: string;
  status: string;
  tracking_no: string | null;
  items: { name: string; qty: number; unit_price_nok: number; line_total_nok: number }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string, token: string): Promise<Order | null> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("online_order_public", { p_order: id, p_token: token });
  if (error || !data) return null;
  return data as Order;
}

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t } = await searchParams;
  if (!UUID.test(id) || !t || !UUID.test(t)) notFound();

  let o = await load(id, t);
  if (!o) notFound();
  if (o.payment_status === "pending" && o.payment_method !== "pay_at_pickup") {
    await syncOrderPayment(id);
    o = (await load(id, t)) ?? o;
  }

  const paidOk = o.payment_method === "pay_at_pickup" || o.payment_status === "authorized" || o.payment_status === "paid";
  const failed = o.payment_status === "failed" || o.status === "cancelled";
  const pending = !paidOk && !failed;

  const statusText: Record<string, string> = {
    new: o.delivery === "pickup" ? "Vi gjør ordren klar" : "Vi pakker ordren",
    ready: "Klar til henting",
    picked_up: "Hentet – takk for handelen!",
    shipped: "Sendt",
    cancelled: "Kansellert",
  };

  return (
    <main className="mx-auto max-w-2xl px-5 pt-10 pb-24 sm:pt-16">
      <OrderClient clearCart={paidOk && !failed} poll={pending} />

      {failed ? (
        <>
          <p className="text-[10px] font-semibold tracking-[0.34em] text-accent-soft uppercase">Ordre #{o.order_no}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Betalingen ble ikke fullført</h1>
          <p className="mt-3 text-muted">
            Ingenting er trukket, og varene ligger fortsatt i handlekurven din. Du kan prøve igjen, eller velge en annen
            betalingsmåte.
          </p>
          <Link href="/butikk/handlekurv" className="pill pill-primary mt-8">
            Tilbake til kassen
          </Link>
        </>
      ) : pending ? (
        <>
          <p className="text-[10px] font-semibold tracking-[0.34em] text-accent-soft uppercase">Ordre #{o.order_no}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Venter på bekreftelse fra Vipps …</h1>
          <p className="mt-3 text-muted">
            Har du godkjent i Vipps-appen? Siden oppdaterer seg selv. Gikk noe galt, kan du{" "}
            <Link href="/butikk/handlekurv" className="underline">
              gå tilbake til kassen
            </Link>
            .
          </p>
        </>
      ) : (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-2xl text-[#1d1a17]" aria-hidden>
            ✓
          </div>
          <p className="mt-6 text-[10px] font-semibold tracking-[0.34em] text-accent-soft uppercase">Ordre #{o.order_no}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Takk, {o.name.split(" ")[0]}!</h1>
          <p className="mt-3 text-[17px] text-fg-soft">
            {o.delivery === "pickup"
              ? `Vi gir deg beskjed på e-post når ordren er klar til henting i ${salon.address}.`
              : "Vi sender deg sporingsnummer på e-post når pakken er på vei."}{" "}
            Bekreftelsen sendes til <span className="font-medium text-fg">{o.email}</span>.
          </p>
          {o.payment_method !== "pay_at_pickup" && (
            <p className="mt-2 text-sm text-muted">Beløpet er reservert i Vipps og trekkes først når ordren er utlevert eller sendt.</p>
          )}
        </>
      )}

      <section className="mt-10 rounded-3xl bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Din ordre</h2>
          {!failed && <span className="rounded-full bg-canvas px-3 py-1 text-xs font-semibold">{statusText[o.status] ?? o.status}</span>}
        </div>
        <ul className="mt-4 divide-y divide-line text-sm">
          {o.items.map((i, k) => (
            <li key={k} className="flex justify-between gap-4 py-2.5">
              <span>
                {i.qty} × {i.name}
              </span>
              <span className="tabular-nums">{kr(Number(i.line_total_nok))}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
          {Number(o.discount_nok) > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">Kundeklubb {o.member_tier ? `(${o.member_tier})` : ""}</dt>
              <dd className="tabular-nums">−{kr(Number(o.discount_nok))}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted">{o.delivery === "ship" ? "Frakt" : "Henting i salongen"}</dt>
            <dd className="tabular-nums">{Number(o.shipping_nok) > 0 ? kr(Number(o.shipping_nok)) : "Gratis"}</dd>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <dt>Totalt</dt>
            <dd className="tabular-nums">{kr(Number(o.total_nok))}</dd>
          </div>
        </dl>
        <div className="mt-5 grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted">Levering</p>
            <p className="mt-1">
              {o.delivery === "pickup" ? (
                <>Hentes i salongen, {salon.address}</>
              ) : (
                <>
                  {o.address}
                  <br />
                  {o.postal_code} {o.city}
                </>
              )}
            </p>
            {o.tracking_no && (
              <a
                className="mt-1 inline-block underline"
                href={`https://sporing.posten.no/sporing/${encodeURIComponent(o.tracking_no)}`}
                target="_blank"
                rel="noreferrer"
              >
                Spor pakken ({o.tracking_no})
              </a>
            )}
          </div>
          <div>
            <p className="text-muted">Betaling</p>
            <p className="mt-1">
              {o.payment_method === "pay_at_pickup" ? "Betales ved henting" : o.payment_method === "card" ? "Kort via Vipps" : "Vipps"}
            </p>
          </div>
        </div>
      </section>

      <p className="mt-8 text-sm text-muted">
        Spørsmål om ordren? Ring oss på{" "}
        <a href={`tel:${salon.phone.replace(/\s/g, "")}`} className="underline">
          {salon.phone}
        </a>{" "}
        eller svar på e-posten. Se også{" "}
        <Link href="/kjopsvilkar" className="underline">
          kjøpsvilkårene
        </Link>
        .
      </p>
      <Link href="/butikk" className="pill pill-soft mt-6">
        Fortsett å handle
      </Link>
    </main>
  );
}
