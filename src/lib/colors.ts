/**
 * Fargesystem for skranken: hver barber får sin egen farge (kolonner),
 * og hver kunde får en konsistent farge (avatar/initialer). Fargene er
 * valgt for god kontrast på den varme, mørke bakgrunnen.
 */

export const PALETTE = [
  "#F47721", // oransje (merkevare)
  "#5AA9E6", // blå
  "#7FB069", // grønn
  "#B892D8", // lilla
  "#E8B84B", // gull
  "#E8735A", // korall
  "#49C5B1", // turkis
  "#E58BB0", // rosa
] as const;

export function colorAt(i: number): string {
  const n = PALETTE.length;
  return PALETTE[((i % n) + n) % n];
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Konsistent farge for en kunde (basert på id eller navn). */
export function customerColor(key: string): string {
  return colorAt(hashString(key || "?"));
}

/** 1–2 initialer for en avatar. */
export function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
