import Link from "next/link";
import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { getSalesForPeriod, getDaysInMonth } from "@/lib/dashboard-queries";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";

/* Oslo lokal midnatt (UTC-instant) for korrekt dags-/måneds-avgrensning. */
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

const MND = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

function BarberMethod({
  byBarber,
  byMethod,
}: {
  byBarber: { name: string; nok: number }[];
  byMethod: { method: string; nok: number }[];
}) {
  const maxB = Math.max(1, ...byBarber.map((b) => b.nok));
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="border border-line bg-surface p-6">
        <h2 className="mb-5 font-display text-lg font-bold">Per barber</h2>
        {byBarber.length === 0 ? (
          <p className="text-sm text-muted">Ingen salg i perioden.</p>
        ) : (
          <div className="space-y-5">
            {byBarber.map((b) => (
              <ProgressBar
                key={b.name}
                value={Math.round((b.nok / maxB) * 100)}
                label={b.name}
                caption={nok(b.nok)}
              />
            ))}
          </div>
        )}
      </div>
      <div className="border border-line bg-surface p-6">
        <h2 className="mb-5 font-display text-lg font-bold">Per betalingsmåte</h2>
        {byMethod.length === 0 ? (
          <p className="text-sm text-muted">—</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {byMethod.map((m) => (
              <li key={m.method} className="flex justify-between border-b border-line pb-2 last:border-0">
                <span className="text-fg-soft">{m.method}</span>
                <span className="font-medium">{nok(m.nok)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Delt drill-down-visning for omsetning. Brukes av både /admin/omsetning og
 * /revisor/omsetning – lenker holdes innenfor `basePath`.
 */
export async function OmsetningView({
  dag,
  mnd,
  basePath,
  backHref,
  backLabel,
}: {
  dag?: string;
  mnd?: string;
  basePath: string;
  backHref: string;
  backLabel: string;
}) {
  const now = new Date();
  const validDag = dag?.match(/^\d{4}-\d{2}-\d{2}$/) ? dag : undefined;
  let validMnd = mnd?.match(/^\d{4}-\d{2}$/) ? mnd : undefined;
  if (!validDag && !validMnd) {
    validMnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  const back = (
    <Link href={backHref} className="text-sm text-muted hover:text-fg">
      ← {backLabel}
    </Link>
  );

  /* ---------- DAGSVISNING ---------- */
  if (validDag) {
    const [y, m, d] = validDag.split("-").map(Number);
    const startIso = osloMidnight(y, m, d);
    const endIso = osloMidnight(y, m, d + 1);
    const { rows, total, byBarber, byMethod } = await getSalesForPeriod(startIso, endIso);
    const title = new Date(validDag + "T12:00:00Z").toLocaleDateString("nb-NO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const avg = rows.length ? Math.round(total / rows.length) : 0;

    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="space-y-1">
          {back}
          <h1 className="font-display text-2xl font-bold capitalize">{title}</h1>
          <Link
            href={`${basePath}?mnd=${validDag.slice(0, 7)}`}
            className="text-sm text-accent-soft hover:underline"
          >
            Se hele måneden →
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Omsetning" value={nok(total)} sub="denne dagen" />
          <StatTile label="Antall salg" value={String(rows.length)} />
          <StatTile label="Snitt per salg" value={nok(avg)} />
        </div>

        <div className="border border-line bg-surface">
          <div className="border-b border-line px-6 py-4">
            <h2 className="font-display text-lg font-bold">Salg denne dagen</h2>
          </div>
          {rows.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted">Ingen registrerte salg.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-6 py-3 font-medium">Tid</th>
                    <th className="px-6 py-3 font-medium">Barber</th>
                    <th className="px-6 py-3 font-medium">Kunde</th>
                    <th className="px-6 py-3 font-medium">Betaling</th>
                    <th className="px-6 py-3 text-right font-medium">Beløp</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="px-6 py-3 tabular-nums">{r.time}</td>
                      <td className="px-6 py-3">{r.barber}</td>
                      <td className="px-6 py-3 text-fg-soft">{r.customer}</td>
                      <td className="px-6 py-3 text-fg-soft">{r.method}</td>
                      <td className="px-6 py-3 text-right font-medium tabular-nums">{nok(r.nok)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <BarberMethod byBarber={byBarber} byMethod={byMethod} />
      </div>
    );
  }

  /* ---------- MÅNEDSVISNING ---------- */
  const [my, mm] = (validMnd as string).split("-").map(Number);
  const startIso = osloMidnight(my, mm, 1);
  const endIso = osloMidnight(my, mm + 1, 1);
  const [{ total, rows, byBarber, byMethod }, days] = await Promise.all([
    getSalesForPeriod(startIso, endIso),
    getDaysInMonth(validMnd as string),
  ]);
  const maxDay = Math.max(1, ...days.map((dd) => dd.nok));
  const avg = rows.length ? Math.round(total / rows.length) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-1">
        {back}
        <h1 className="font-display text-2xl font-bold">
          {MND[mm - 1]} {my}
        </h1>
        <p className="text-sm text-muted">Klikk en dag for å se enkeltsalgene.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Omsetning" value={nok(total)} sub="hele måneden" />
        <StatTile label="Antall salg" value={String(rows.length)} />
        <StatTile label="Snitt per salg" value={nok(avg)} />
      </div>

      <div className="border border-line bg-surface">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Omsetning per dag</h2>
        </div>
        {days.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">Ingen salg denne måneden.</p>
        ) : (
          <ul>
            {days.map((dd) => (
              <li key={dd.key} className="border-b border-line last:border-0">
                <Link
                  href={`${basePath}?dag=${dd.key}`}
                  className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-surface-2"
                >
                  <span className="w-14 text-sm text-fg-soft tabular-nums">{dd.label}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                    <span
                      className="block h-full rounded-full bg-accent-soft"
                      style={{ width: `${Math.round((dd.nok / maxDay) * 100)}%` }}
                    />
                  </span>
                  <span className="w-28 text-right text-sm font-medium tabular-nums">{nok(dd.nok)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <BarberMethod byBarber={byBarber} byMethod={byMethod} />
    </div>
  );
}
