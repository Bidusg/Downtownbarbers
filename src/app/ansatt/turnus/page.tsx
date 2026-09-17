import { getMyStaffLink, getMyTurnus, getMyUpcomingShifts } from "@/lib/ansatt-queries";
import { getTurnusAnchor } from "@/lib/ops-queries";

export const dynamic = "force-dynamic";

const DAYS: { n: number; l: string }[] = [
  { n: 1, l: "Mandag" },
  { n: 2, l: "Tirsdag" },
  { n: 3, l: "Onsdag" },
  { n: 4, l: "Torsdag" },
  { n: 5, l: "Fredag" },
  { n: 6, l: "Lørdag" },
  { n: 0, l: "Søndag" },
];

// ISO-ukenummer – samme regel som available_slots/turnus_week_parity i DB.
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function fmtDay(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", {
      weekday: "long",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

export default async function AnsattTurnus() {
  const [link, turnus, upcoming, anchor] = await Promise.all([
    getMyStaffLink(),
    getMyTurnus(),
    getMyUpcomingShifts(21),
    getTurnusAnchor(),
  ]);

  const wk = isoWeek(new Date());
  const currentParity: 1 | 2 = (wk % 2 === 0) === anchor.aIsEven ? 1 : 2;
  const currentLabel = currentParity === 1 ? "Uke A" : "Uke B";

  // parity 0 = hver uke, 1 = A, 2 = B
  const forParity = (p: 1 | 2) =>
    turnus.filter((r) => r.week_parity === 0 || r.week_parity === p);

  const cell = (p: 1 | 2, weekday: number) => {
    const rows = forParity(p)
      .filter((r) => r.weekday === weekday)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    if (rows.length === 0) return <span className="text-muted">Fri</span>;
    return (
      <span className="font-display text-fg">
        {rows.map((r) => `${r.start_time}–${r.end_time}`).join(", ")}
      </span>
    );
  };

  const WeekColumn = ({ p, label }: { p: 1 | 2; label: string }) => {
    const isNow = (p === 1 ? 1 : 2) === currentParity;
    return (
      <div className="border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-display text-sm font-bold text-fg">{label}</h2>
          {isNow && (
            <span className="rounded-full bg-accent-soft/15 px-2 py-0.5 text-[10px] font-semibold text-accent-soft uppercase">
              Denne uken
            </span>
          )}
        </div>
        <ul className="divide-y divide-line">
          {DAYS.map((d) => (
            <li
              key={d.n}
              className="flex items-center justify-between px-4 py-2.5 text-sm"
            >
              <span className="text-muted">{d.l}</span>
              {cell(p, d.n)}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="font-display text-xl font-bold">Min turnus</h1>
        <p className="mt-1 text-sm text-muted">
          Din faste ukeplan (uke A / uke B). Denne uken (uke {wk}) er{" "}
          <strong className="text-accent-soft">{currentLabel}</strong>. Endringer
          gjøres av admin.
        </p>
      </div>

      {!link.linked ? (
        <div className="border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
          Kontoen din er ikke koblet til en ansattprofil enda. Be admin sette
          e-posten din på din ansatt-rad, så vises turnusen din her.
        </div>
      ) : turnus.length === 0 ? (
        <div className="border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
          Ingen turnus er satt opp for deg enda. Be admin legge inn ukeplanen din
          under Timelister.
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <WeekColumn p={1} label="Uke A" />
          <WeekColumn p={2} label="Uke B" />
        </div>
      )}

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
          Kommende vakter (neste 3 uker)
        </h2>
        {upcoming.length === 0 ? (
          <div className="border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
            Ingen planlagte vakter de neste tre ukene.
          </div>
        ) : (
          <ul className="divide-y divide-line border border-line bg-surface">
            {upcoming.map((s, i) => (
              <li
                key={`${s.work_date}-${i}`}
                className="flex items-center gap-4 px-4 py-3 text-sm"
              >
                <span className="w-44 text-fg">{fmtDay(s.work_date)}</span>
                <span className="font-display font-bold text-fg">
                  {s.start_time}–{s.end_time}
                </span>
                <span className="ml-auto rounded-full bg-accent-soft/10 px-2 py-0.5 text-[10px] font-semibold text-accent-soft uppercase">
                  {s.week_parity === 1 ? "Uke A" : "Uke B"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-muted">
          Utledet av turnusen din. Heldags fravær og registrert ferie er trukket
          fra. Ekstravakter for enkeltdatoer vises ikke her.
        </p>
      </section>
    </main>
  );
}
