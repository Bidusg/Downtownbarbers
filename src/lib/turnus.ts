/**
 * Delte hjelpere for uke-rotasjon (turnus). week_parity: 0 = hver uke,
 * 1..N = uke-indeks (1=A, 2=B, 3=C …).
 */

export const MAX_ROTATION_WEEKS = 6;

/** 1 → «A», 2 → «B», … */
export function parityLetter(index: number): string {
  if (index < 1) return "";
  return String.fromCharCode(64 + index);
}

/** 0 → «Hver uke», n → «Uke A/B/…» */
export function parityLabel(index: number): string {
  if (index === 0) return "Hver uke";
  return `Uke ${parityLetter(index)}`;
}

/** [1..weeks] – uke-indeksene i rotasjonen. */
export function parityOptions(weeks: number): number[] {
  const n = Math.max(1, Math.min(MAX_ROTATION_WEEKS, Math.floor(weeks) || 2));
  return Array.from({ length: n }, (_, i) => i + 1);
}
