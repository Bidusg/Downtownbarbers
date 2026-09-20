import { requireRole } from "@/lib/auth";
import { StatTile } from "@/components/ui/StatTile";
import { PAYROLL } from "@/lib/ops-queries";
import { resolvePeriod } from "@/lib/period";
import { getPeriodReport } from "@/lib/dashboard-queries";

export const dynamic = "force-dynamic";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";
const MND = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

export default async function RevisorRapport({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; ar?: string; kv?: string; hy?: string }>;
}) {
  await requireRole(["revisor", "admin"]);
  const sp = await searchParams;
  const p = resolvePeriod(sp);

  const rep = await getPeriodReport(p.fromIso, p.toIso);

  const inkl = rep.total;
  const eks = Math.round(inkl / (1 + PAYROLL.MVA));
  const mva = inkl - eks;
  const snitt = rep.count ? Math.round(inkl / rep.count) : 0;
  const monthMap = new Map(rep.byMonth.map((m) => [m.key, m]));
  const maxMonth = Math.max(1, ...p.months.map((m) => monthMap.get(m.key)?.nok ?? 0));
  const maxBarber = Math.max(1, ...rep.byBarber.map((b) => b.nok));

  const base = "/revisor/rapport";
  const typeTab = (t: "kvartal" | "halvaar" | "helaar", label: string) => (
    <a
      href={`${base}?type=${t}&ar=${p.year}`}
      className={
        "border-b-2 px-3 py-2 text-sm transition-colors " +
        (p.type === t
          ? "border-accent-soft font-semibold text-fg"
          : "border-transparent text-muted hover:text-fg")
      }
    >
      {label}
    </a>
  );
  const chip = (active: boolean, href: string, label: string) => (
    <a
      href={href}
      className={
        "border px-3 py-1.5 text-sm transition-colors " +
        (active
          ? "border-accent-soft bg-accent-soft/10 font-semibold text-fg"
          : "border-line text-muted hover:border-line-2 hover:text-fg")
      }
    >
      {label}
    </a>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Perioderapport</h1>
          <p className="text-sm text-muted">
            Nøkkeltall for kvartals-, halvårs- og helårsrapport. Beløp inkl. mva
            der ikke annet er angitt.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/revisor/eksport?from=${p.fromDate}&to=${p.toDate}`}
            className="border border-line-2 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent-soft"
          >
            Salg i perioden (CSV)
          </a>
          <a
            href={`/revisor/eksport/saft?from=${p.fromDate}&to=${p.toDate}`}
            className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
          >
            SAF-T (XML)
          </a>
        </div>
      </div>

      {/* Velger */}
      <div className="border border-line bg-surface">
        <div className="flex items-center gap-1 border-b border-line px-4">
          {typeTab("kvartal", "Kvartal")}
          {typeTab("halvaar", "Halvår")}
          {typeTab("helaar", "Helår")}
        </div>
        <div className="flex flex-wrap items-center gap-3 p-4">
          {/* Årsvelger */}
          <div className="flex items-center gap-2">
            <a
              href={`${base}?type=${p.type}&ar=${p.year - 1}${p.type === "kvartal" ? `&kv=${p.index}` : p.type === "halvaar" ? `&hy=${p.index}` : ""}`}
              className="border border-line px-2 py-1 text-sm text-muted hover:text-fg"
              aria-label="Forrige år"
            >
              ←
            </a>
            <span className="min-w-16 text-center font-display text-lg font-bold">{p.year}</span>
            <a
              href={`${base}?type=${p.type}&ar=${p.year + 1}${p.type === "kvartal" ? `&kv=${p.index}` : p.type === "halvaar" ? `&hy=${p.index}` : ""}`}
              className="border border-line px-2 py-1 text-sm text-muted hover:text-fg"
              aria-label="Neste år"
            >
              →
            </a>
          </div>

          {/* Kvartal/halvår-valg */}
          {p.type === "kvartal" && (
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((q) =>
                chip(p.index === q, `${base}?type=kvartal&ar=${p.year}&kv=${q}`, `Q${q}`),
              )}
            </div>
          )}
          {p.type === "halvaar" && (
            <div className="flex flex-wrap gap-2">
              {chip(p.index === 1, `${base}?type=halvaar&ar=${p.year}&hy=1`, "1. halvår")}
              {chip(p.index === 2, `${base}?type=halvaar&ar=${p.year}&hy=2`, "2. halvår")}
            </div>
          )}
        </div>
      </div>

      <h2 className="font-display text-xl font-bold">{p.label}</h2>

      {/* Nøkkeltall */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile label="Omsetning inkl. mva" value={nok(inkl)} sub={p.label} />
        <StatTile label="Omsetning eks. mva" value={nok(eks)} sub={`${Math.round(PAYROLL.MVA * 100)} % mva`} />
        <StatTile label="Utgående mva" value={nok(mva)} sub="beregnet, standard sats" />
        <StatTile label="Antall salg" value={String(rep.count)} />
        <StatTile label="Snitt per salg" value={nok(snitt)} />
        <StatTile label="Antall barbere" value={String(rep.byBarber.length)} sub="med salg i perioden" />
      </div>

      {/* Per måned */}
      <div className="border border-line bg-surface">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Omsetning per måned</h2>
        </div>
        <ul>
          {p.months.map((m) => {
            const v = monthMap.get(m.key);
            const val = v?.nok ?? 0;
            const [y, mm] = m.key.split("-").map(Number);
            return (
              <li key={m.key} className="flex items-center gap-4 border-b border-line px-6 py-3 last:border-0">
                <span className="w-28 text-sm text-fg-soft">{MND[mm - 1]} {y}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                  <span
                    className="block h-full rounded-full bg-accent-soft"
                    style={{ width: `${Math.round((val / maxMonth) * 100)}%` }}
                  />
                </span>
                <span className="w-16 text-right text-xs text-muted tabular-nums">{v?.count ?? 0} salg</span>
                <span className="w-28 text-right text-sm font-medium tabular-nums">{nok(val)}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Per barber + per betalingsmåte */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="border border-line bg-surface p-6">
          <h2 className="mb-5 font-display text-lg font-bold">Per barber</h2>
          {rep.byBarber.length === 0 ? (
            <p className="text-sm text-muted">Ingen salg i perioden.</p>
          ) : (
            <div className="space-y-4">
              {rep.byBarber.map((b) => (
                <div key={b.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-fg">{b.name}</span>
                    <span className="font-medium tabular-nums">{nok(b.nok)}</span>
                  </div>
                  <span className="block h-2 overflow-hidden rounded-full bg-line">
                    <span
                      className="block h-full rounded-full bg-accent-soft"
                      style={{ width: `${Math.round((b.nok / maxBarber) * 100)}%` }}
                    />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border border-line bg-surface p-6">
          <h2 className="mb-5 font-display text-lg font-bold">Per betalingsmåte</h2>
          {rep.byMethod.length === 0 ? (
            <p className="text-sm text-muted">—</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {rep.byMethod.map((m) => (
                <li key={m.method} className="flex justify-between border-b border-line pb-2 last:border-0">
                  <span className="text-fg-soft">{m.method}</span>
                  <span className="font-medium tabular-nums">{nok(m.nok)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-xs text-muted">
        Mva er beregnet med standard sats ({Math.round(PAYROLL.MVA * 100)} %) fra
        salg registrert inkl. mva. For offisiell innsending, kjør SAF-T-filen
        gjennom Skatteetatens validator.
      </p>
    </div>
  );
}
