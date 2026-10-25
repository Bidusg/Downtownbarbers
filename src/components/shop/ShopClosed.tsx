import Link from "next/link";
import { TOr } from "@/lib/i18n/T";

/** Vises når nettbutikken er stengt (ikke åpnet ennå). */
export function ShopClosed() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center px-5 py-24 text-center sm:py-32">
      <p className="text-[10px] font-semibold tracking-[0.34em] text-accent-soft uppercase">
        <TOr no="Nettbutikk" en="Online store" />
      </p>
      <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">
        <TOr no="Snart åpent" en="Opening soon" />
      </h1>
      <p className="mt-5 max-w-xl text-muted">
        <TOr
          no="Nettbutikken åpner snart. Frem til da får du alle produktene våre og gavekort i salongen – kom innom eller bestill time."
          en="The online store opens soon. Until then you'll find all our products and gift cards in the salon – drop by or book a time."
        />
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/booking" className="pill pill-primary">
          <TOr no="Bestill time" en="Book appointment" />
        </Link>
        <Link href="/" className="pill pill-soft">
          <TOr no="Til forsiden" en="Back to home" />
        </Link>
      </div>
    </section>
  );
}
