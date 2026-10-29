import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { getActivePromo, promoDate } from "@/lib/promo";
import { getWebshopSettings } from "@/lib/shop";
import { getRequestLang } from "@/lib/i18n/server-lang";
import { PUBLIC_VIEWPORT } from "@/lib/public-viewport";

export const viewport = PUBLIC_VIEWPORT;
export const dynamic = "force-dynamic";
export const metadata = { title: "Ditt tilbud | Downtown Barbers", robots: { index: false, follow: false } };

/** Tilbudssiden man lander på etter å ha skannet QR-koden. */
export default async function TilbudPage() {
  const [promo, shop, lang] = await Promise.all([getActivePromo(), getWebshopSettings(), getRequestLang()]);
  if (!promo) redirect("/booking");
  const en = lang === "en";

  const perks: { pct: number; title: string; text: string }[] = [];
  if (promo.bookingOpen && promo.servicePct > 0)
    perks.push({
      pct: promo.servicePct,
      title: en ? "On your appointment" : "På timen din",
      text: en
        ? `Book online${promo.bookBy ? ` by ${promoDate(promo.bookBy, true)}` : ""} – the discount is applied automatically.`
        : `Book på nett${promo.bookBy ? ` innen ${promoDate(promo.bookBy)}` : ""} – rabatten legges på automatisk.`,
    });
  if (promo.bookingOpen && promo.friendPct > 0)
    perks.push({
      pct: promo.friendPct,
      title: en ? "For a friend you bring" : "Til en venn du tar med",
      text: en
        ? "Choose «We're a group» in the booking and add your friend – you sit in the chairs side by side."
        : "Velg «Vi er flere personer» i bookingen og legg til vennen din – dere sitter i stolen samtidig.",
    });
  if (promo.productsOpen)
    perks.push({
      pct: promo.productPct,
      title: en ? "On all products" : "På alle produkter",
      text: en
        ? `At your visit or in our online shop${promo.productsUntil ? ` until ${promoDate(promo.productsUntil, true)}` : ""}. Perfect Christmas gifts.`
        : `Når du er hos oss, eller i nettbutikken${promo.productsUntil ? ` til ${promoDate(promo.productsUntil)}` : ""}. Perfekt til julegaver.`,
    });

  return (
    <div className="cine min-h-screen bg-canvas text-fg">
      <Header />
      <main id="main" className="mx-auto max-w-3xl px-5 pt-10 pb-24 sm:pt-16">
        <p className="m-eyebrow">{promo.label}</p>
        <h1 className="m-title mt-3 text-4xl sm:text-6xl">
          {en ? "Your private offer" : promo.headline || "Ditt tilbud"}
        </h1>
        {promo.body && !en && <p className="mt-5 max-w-xl text-lg text-muted">{promo.body}</p>}
        {en && (
          <p className="mt-5 max-w-xl text-lg text-muted">
            A private offer for you – not available anywhere else on our site.
            {promo.friendPct > 0 ? " Bring a friend and they get a discount too." : ""}
          </p>
        )}

        <ul className="mt-10 grid gap-3 sm:mt-12">
          {perks.map((p) => (
            <li
              key={p.title}
              className="flex items-center gap-5 rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_oklch(var(--line))] sm:p-6"
            >
              <span className="w-24 shrink-0 text-4xl font-semibold tracking-tight tabular-nums text-accent-soft sm:text-5xl">
                −{p.pct}%
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold tracking-tight">{p.title}</span>
                <span className="mt-0.5 block text-[15px] text-muted">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap gap-3">
          {promo.bookingOpen && (
            <Link href="/booking" className="pill pill-primary">
              {en ? "Book now" : "Book time nå"}
            </Link>
          )}
          {promo.productsOpen && shop.live && (
            <Link href="/butikk" className="pill pill-soft">
              {en ? "Shop products" : "Se produktene"}
            </Link>
          )}
        </div>

        <p className="mt-8 text-[13px] text-muted">
          {en
            ? `The offer is saved on this device and only applies to online bookings.${promo.visitBy ? ` Appointment by ${promoDate(promo.visitBy, true)}.` : ""} One use per customer.`
            : `Tilbudet er lagret på denne enheten og gjelder bare ved booking på nett.${promo.visitBy ? ` Timen må være innen ${promoDate(promo.visitBy)}.` : ""} Gjelder én gang per kunde.`}
        </p>
      </main>
      <Footer />
    </div>
  );
}
