/* Delt mellom klient (kassa-skjermen) og server (lib/member.ts). */

export type BookingMember = { tier: string; servicePct: number; productPct: number };

/** Rabatt i kr: tjeneste og produkter avrundes hver for seg. */
export function memberDiscountNok(m: BookingMember | null, serviceNok: number, productNok: number): number {
  if (!m) return 0;
  return (
    Math.round((Math.max(0, serviceNok) * m.servicePct) / 100) +
    Math.round((Math.max(0, productNok) * m.productPct) / 100)
  );
}
