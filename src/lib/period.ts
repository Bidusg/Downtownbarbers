// Perioder for revisor-rapporter: kvartal, halvår og helår. Rene hjelpere
// (ingen server-avhengigheter) som gir Oslo-korrekte start/slutt-instanter,
// eksport-datoer (yyyy-mm-dd) og måneds-listen i perioden.

export type PeriodType = "kvartal" | "halvaar" | "helaar";

export type ResolvedPeriod = {
  type: PeriodType;
  year: number;
  index: number; // kvartal 1–4, halvår 1–2, helår 1
  label: string; // "Q3 2026" / "1. halvår 2026" / "Helår 2026"
  fromIso: string; // Oslo midnnatt, start (UTC-instant)
  toIso: string; // Oslo midnatt, slutt (eksklusiv)
  fromDate: string; // yyyy-mm-dd, inklusiv
  toDate: string; // yyyy-mm-dd, siste dag inklusiv
  months: { key: string; label: string }[]; // yyyy-mm i perioden
};

const MND_SHORT = [
  "jan", "feb", "mar", "apr", "mai", "jun",
  "jul", "aug", "sep", "okt", "nov", "des",
];

const pad = (n: number) => String(n).padStart(2, "0");

/* Oslo lokal midnatt som UTC-instant (samme mønster som OmsetningView). */
function tzOffsetMs(instant: number, tz: string): number {
  const d = new Date(instant);
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const loc = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  return loc.getTime() - utc.getTime();
}
function osloMidnight(y: number, m: number, d: number): string {
  const base = Date.UTC(y, m - 1, d);
  return new Date(base - tzOffsetMs(base, "Europe/Oslo")).toISOString();
}

const MND_LANG = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

/**
 * Én måned (Oslo) fra 'yyyy-mm' (default inneværende måned), med forrige/neste
 * måned til enkel navigasjon.
 */
export function osloMonthRange(mnd?: string): {
  key: string;
  label: string;
  fromIso: string;
  toIso: string;
  prev: string;
  next: string;
} {
  const now = new Date();
  const curKey = now
    .toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" })
    .slice(0, 7);
  const key = mnd && /^\d{4}-\d{2}$/.test(mnd) ? mnd : curKey;
  const [y, m] = key.split("-").map(Number);
  const prevD = new Date(Date.UTC(y, m - 2, 1));
  const nextD = new Date(Date.UTC(y, m, 1));
  return {
    key,
    label: `${MND_LANG[m - 1]} ${y}`,
    fromIso: osloMidnight(y, m, 1),
    toIso: osloMidnight(y, m + 1, 1),
    prev: `${prevD.getUTCFullYear()}-${pad(prevD.getUTCMonth() + 1)}`,
    next: `${nextD.getUTCFullYear()}-${pad(nextD.getUTCMonth() + 1)}`,
  };
}

/**
 * Løs periode fra søkeparametre. Default: inneværende kvartal/år.
 *   type=kvartal&ar=2026&kv=3
 *   type=halvaar&ar=2026&hy=2
 *   type=helaar&ar=2026
 */
export function resolvePeriod(sp: {
  type?: string;
  ar?: string;
  kv?: string;
  hy?: string;
}): ResolvedPeriod {
  const now = new Date();
  const curYear = Number(
    now.toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" }).slice(0, 4),
  );
  const curMonth = Number(
    now.toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" }).slice(5, 7),
  );

  const type: PeriodType =
    sp.type === "halvaar" ? "halvaar" : sp.type === "helaar" ? "helaar" : "kvartal";

  let year = Number(sp.ar);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) year = curYear;

  let index: number;
  let startM: number;
  let count: number;

  if (type === "kvartal") {
    const def = Math.floor((curMonth - 1) / 3) + 1;
    index = Number(sp.kv);
    if (!Number.isInteger(index) || index < 1 || index > 4) index = def;
    startM = (index - 1) * 3 + 1;
    count = 3;
  } else if (type === "halvaar") {
    const def = curMonth <= 6 ? 1 : 2;
    index = Number(sp.hy);
    if (!Number.isInteger(index) || index < 1 || index > 2) index = def;
    startM = (index - 1) * 6 + 1;
    count = 6;
  } else {
    index = 1;
    startM = 1;
    count = 12;
  }

  const endM = startM + count; // eksklusiv (kan bli 13 for helår → jan neste år)
  const lastDay = new Date(Date.UTC(year, endM - 1, 0)).getUTCDate();

  const months: { key: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const m = startM + i;
    months.push({ key: `${year}-${pad(m)}`, label: MND_SHORT[m - 1] });
  }

  const label =
    type === "kvartal"
      ? `Q${index} ${year}`
      : type === "halvaar"
        ? `${index}. halvår ${year}`
        : `Helår ${year}`;

  return {
    type,
    year,
    index,
    label,
    fromIso: osloMidnight(year, startM, 1),
    toIso: osloMidnight(year, endM, 1),
    fromDate: `${year}-${pad(startM)}-01`,
    toDate: `${year}-${pad(endM - 1)}-${pad(lastDay)}`,
    months,
  };
}
