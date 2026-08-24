/** Enkel, delt validering for booking-skjemaet (klient + server). */

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** Norsk mobilnummer: 8 siffer, valgfritt +47/0047-prefiks. */
export function isValidNorwegianPhone(v: string): boolean {
  const cleaned = v.replace(/[\s-]/g, "").replace(/^(\+47|0047)/, "");
  return /^\d{8}$/.test(cleaned);
}

/** Normaliser navn til Tittel-Case ("kidus girma" -> "Kidus Girma"). */
export function titleCase(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
