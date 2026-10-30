/** Felles dato/tid-hjelpere for ansatt-appen (alltid norsk tid). */

const TZ = "Europe/Oslo";

/** «2026-10-29» for et tidspunkt, i Oslo-tid. */
export function osloDate(d: Date | string = new Date()): string {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
}

/** «14:30». */
export function osloTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("nb-NO", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

/** «I dag», «I morgen» eller «fredag 31. okt.». */
export function dayLabel(isoDate: string, today = osloDate()): string {
  const tomorrow = osloDate(new Date(Date.parse(today + "T12:00:00Z") + 86400000));
  if (isoDate === today) return "I dag";
  if (isoDate === tomorrow) return "I morgen";
  return new Date(isoDate + "T12:00:00Z").toLocaleDateString("nb-NO", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

/** Fornavn fra fullt navn. */
export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

/** Nå, i millisekunder (egen funksjon så server-sidene kan bruke den fritt). */
export function nowMs(): number {
  return Date.now();
}
