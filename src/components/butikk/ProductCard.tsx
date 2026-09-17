import type { SVGProps } from "react";
import { initials } from "@/lib/colors";
import type { PublicProduct } from "@/lib/queries";

/* Enkle linje-ikoner (arver farge via currentColor). */
function GiftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8" />
      <path d="M2 8.5h20v3.5H2z" />
      <path d="M12 8.5V21" />
      <path d="M12 8.5S10.5 3.5 7.5 3.5 4 6.5 4 6.5 6 8.5 12 8.5Z" />
      <path d="M12 8.5s1.5-5 4.5-5S20 6.5 20 6.5s-2 2-8 2Z" />
    </svg>
  );
}

function StoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M3 9.5 4.2 4.4A1 1 0 0 1 5.17 3.7h13.66a1 1 0 0 1 .97.7L21 9.5" />
      <path d="M4 9.5v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-10" />
      <path d="M3 9.5h18" />
      <path d="M9 20.5v-5.5h6v5.5" />
    </svg>
  );
}

/**
 * Produktkort for nettbutikken. Viser ekte produktbilde når det finnes,
 * ellers en merkevaretilpasset plassholder (monogram / gavekort-ikon på
 * bg-surface-2). Online kjøp er ikke aktivert ennå, så kortet kommuniserer
 * bevisst «kjøpes i salongen» i stedet for en handlekurv-knapp.
 */
export function ProductCard({ product: p }: { product: PublicProduct }) {
  const badgeLabel = p.is_gift_card ? "Gavekort · i salongen" : "I salongen";

  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <div className="relative aspect-square overflow-hidden bg-surface-2">
        {p.image_url ? (
          // Prosjektet bruker vanlig <img> (se resten av kodebasen), ikke next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.image_url}
            alt={p.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-line-2">
            {p.is_gift_card ? (
              <GiftIcon className="h-12 w-12" />
            ) : (
              <span className="font-display text-4xl font-bold tracking-wide select-none">
                {initials(p.name)}
              </span>
            )}
            <span className="text-[10px] font-semibold tracking-[0.25em] text-muted uppercase">
              Downtown Barbers
            </span>
          </div>
        )}

        {/* Bevisst «kjøpes i salongen»-merking, ikke en halvferdig kjøp-knapp. */}
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full border border-line bg-canvas/85 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-fg-soft uppercase backdrop-blur-sm">
          {p.is_gift_card ? (
            <GiftIcon className="h-3 w-3" />
          ) : (
            <StoreIcon className="h-3 w-3" />
          )}
          {badgeLabel}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="font-medium text-fg">{p.name}</p>
        {p.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted">{p.description}</p>
        )}
        <div className="mt-3 flex items-end justify-between gap-2">
          <p className="font-display text-lg font-bold text-fg">
            {p.price_nok} kr
          </p>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-soft">
            <StoreIcon className="h-3.5 w-3.5" />
            Kjøp i salongen
          </span>
        </div>
      </div>
    </article>
  );
}
