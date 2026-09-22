"use client";

import type { MemberCampaignOffer } from "@/app/kasse/actions";

/**
 * Rabatt i kr for en valgt kupong mot en gitt brutto (kun til visning – den
 * autoritative rabatten beregnes server-side i record_sale/record_walkin_sale).
 */
export function couponDiscount(
  offer: MemberCampaignOffer | null | undefined,
  gross: number,
): number {
  if (!offer) return 0;
  const raw =
    offer.discountType === "percent"
      ? Math.round((gross * offer.discountValue) / 100)
      : offer.discountValue;
  return Math.max(0, Math.min(Math.round(raw), Math.round(gross)));
}

const kr = (n: number) => `${Math.round(n)} kr`;

/**
 * Velg en medlems-kupong for kunden i kassa. Vises kun når kunden har gyldige
 * kuponger. Ett trykk velger/av-velger. Rabatten som vises er et estimat mot
 * brutto; serveren beregner og validerer det endelige beløpet ved betaling.
 */
export function CouponPicker({
  offers,
  selectedId,
  onSelect,
  gross,
}: {
  offers: MemberCampaignOffer[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  gross: number;
}) {
  if (offers.length === 0) return null;

  return (
    <div className="mb-3">
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
        Medlemskupong
      </p>
      <div className="space-y-1.5">
        {offers.map((o) => {
          const active = o.id === selectedId;
          const disc = couponDiscount(o, gross);
          const label =
            o.discountType === "percent"
              ? `−${o.discountValue}%`
              : `−${kr(o.discountValue)}`;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(active ? null : o.id)}
              className={
                "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors " +
                (active
                  ? "border-accent-soft bg-accent-soft/10 text-fg"
                  : "border-line text-fg hover:border-accent-soft")
              }
            >
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{o.name}</span>
                {o.description && (
                  <span className="block truncate text-xs text-muted">
                    {o.description}
                  </span>
                )}
              </span>
              <span className="whitespace-nowrap text-xs font-semibold text-accent-soft">
                {label}
                {gross > 0 && active ? ` = −${kr(disc)}` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
