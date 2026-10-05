/**
 * Oslo-tid → UTC-tidspunkt, uavhengig av serverens tidssone.
 *
 * Bakgrunn: `new Date("2026-10-06T13:00:00")` tolkes i prosessens lokale
 * tidssone. På Vercel er det UTC, så en kunde som booket «13:00» ble lagret
 * som 13:00 UTC = 15:00 i Oslo og dukket opp to timer for sent i kassa.
 * Her regner vi ut riktig offset (CET/CEST, inkl. sommertid) for akkurat det
 * tidspunktet og returnerer korrekt ISO-streng.
 */
const TZ = "Europe/Oslo";

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Hva klokka er i Oslo for et gitt UTC-tidspunkt, som ms «lokal epoch». */
function osloWallClockMs(utcMs: number): number {
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
}

/**
 * `date` = "YYYY-MM-DD", `time` = "HH:MM" (Oslo-tid). Returnerer ISO-streng i
 * UTC som tilsvarer dette veggklokke-tidspunktet i Oslo.
 */
export function osloToUtcISO(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wanted = Date.UTC(y, m - 1, d, hh, mm || 0, 0);
  // Første gjetning: anta UTC, finn offset, juster – og sjekk én gang til
  // (dekker overgangen sommer-/vintertid).
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const offset = osloWallClockMs(guess) - guess;
    guess = wanted - offset;
  }
  return new Date(guess).toISOString();
}
