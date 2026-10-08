/* =====================================================================
 * Tall-format for lønnsrapporten (klient- og server-trygg).
 *   Timma viser beløp med inntil to desimaler (f.eks. 281,25), så vi
 *   bruker nb-NO med maks 2 desimaler – heltall vises uten desimaler.
 * ===================================================================== */

/** 281.25 → «281,25», 1234 → «1 234» (uten enhet). */
export function num2(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toLocaleString("nb-NO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Beløp med enhet: 281.25 → «281,25 kr», −2000 → «−2 000 kr». */
export function kr2(n: number | null | undefined): string {
  return `${num2(n)} kr`;
}

/** Prosent fra andel: 0.4 → «40 %». */
export function pct(rate: number): string {
  return `${num2(rate * 100)} %`;
}
