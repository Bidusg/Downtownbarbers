import {
  getMyExceptions,
  getMyStaffLink,
  getMyTurnus,
  getMyUpcomingShifts,
  type MyTurnusRow,
} from "@/lib/ansatt-queries";
import { getTurnusRotation } from "@/lib/ops-queries";
import { parityLabel, parityOptions } from "@/lib/turnus";
import { osloDate } from "@/lib/ansatt-format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

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

// ISO-ukenummer for en Oslo-dato (YYYY-MM-DD) – samme regel som turnus_week_parity i DB.
function isoWeek(osloIso: string): number {
  const [y, m, d] = osloIso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function fmtDay(iso: string) {
  try {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("nb-NO", {
      timeZone: "UTC",
      weekday: "long",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

/** Radene som gjelder for en gitt rotasjonsuke (0 = hver uke gjelder alltid). */
function rowsFor(turnus: MyTurnusRow[], parity: number, weekday: number): MyTurnusRow[] {
  return turnus
    .filter((r) => (r.week_parity === 0 || r.week_parity === parity) && r.weekday === weekday)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

function DayCell({ rows }: { rows: MyTurnusRow[] }) {
  if (rows.length === 0) return <span className="text-muted">Fri</span>;
  return (
    <span className="text-right">
      <span className="font-display text-fg">
        {rows.map((r) => `${r.start_time}–${r.end_time}`).join(", ")}
      </span>
      {rows
        .filter((r) => r.pause_start && r.pause_end)
        .map((r) => (
          <span key={`${r.pause_start}`} className="block text-[11px] text-muted">
            {r.pause_note || "Pause"} {r.pause_start}–{r.pause_end}
          </span>
        ))}
    </span>
  );
}

function WeekColumn({
  parity,
  isNow,
  turnus,
}: {
  parity: number;
  isNow: boolean;
  turnus: MyTurnusRow[];
}) {
  return (
    <Card padded={false}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-display text-sm font-bold text-fg">{parityLabel(parity)}</h2>
        {isNow && (
          <Badge tone="accent" className="uppercase">
            Denne uken
          </Badge>
        )}
      </div>
      <ul className="divide-y divide-line">
        {DAYS.map((d) => (
          <li key={d.n} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-muted">{d.l}</span>
            <DayCell rows={rowsFor(turnus, parity, d.n)} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function AnsattTurnus() {
  const today = osloDate();
  const horizon = osloDate(new Date(Date.parse(today + "T12:00:00Z") + 60 * 86400000));
  const [link, turnus, upcoming, rotation, exceptions] = await Promise.all([
    getMyStaffLink(),
    getMyTurnus(),
    getMyUpcomingShifts(21),
    getTurnusRotation(),
    getMyExceptions(today, horizon),
  ]);

  const wk = isoWeek(today);
  // Antall uker i rotasjonen: fra innstillingen, men aldri færre enn det turnusen/vaktene bruker.
  const maxUsed = Math.max(0, ...turnus.map((r) => r.week_parity), ...upcoming.map((s) => s.week_parity));
  const weeks = Math.max(rotation.weeks, maxUsed);
  const options = parityOptions(weeks);
  const currentParity = Math.min(Math.max(rotation.currentIndex, 1), weeks);

  // Kun kommende ekstravakter (fri vises allerede via fraværet som trekkes fra vaktene).
  const extras = exceptions
    .filter((e) => e.kind === "extra" && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <PageHeader title="Min turnus" />
        <p className="mt-1 text-sm text-muted">
          Din faste ukeplan ({options.map((p) => parityLabel(p).toLowerCase()).join(" / ")}). Denne uken (uke {wk}) er{" "}
          <strong className="text-accent-soft">{parityLabel(currentParity)}</strong>. Endringer
          gjøres av admin.
        </p>
      </div>

      {!link.linked ? (
        <EmptyState description="Kontoen din er ikke koblet til en ansattprofil enda. Be admin sette e-posten din på din ansatt-rad, så vises turnusen din her." />
      ) : turnus.length === 0 ? (
        <EmptyState description="Ingen turnus er satt opp for deg enda. Be admin legge inn ukeplanen din under Timelister." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {options.map((p) => (
            <WeekColumn key={p} parity={p} isNow={p === currentParity} turnus={turnus} />
          ))}
        </div>
      )}

      {extras.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
            Ekstravakter
          </h2>
          <Card padded={false}>
            <ul className="divide-y divide-line">
              {extras.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <span className="w-44 text-fg">{fmtDay(e.date)}</span>
                  <span className="font-display font-bold text-fg">
                    {e.start_time && e.end_time ? `${e.start_time}–${e.end_time}` : "Hele dagen"}
                  </span>
                  {e.note && <span className="text-[12px] text-muted">{e.note}</span>}
                  <Badge tone="accent" className="ml-auto uppercase">
                    Ekstra
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
          Kommende vakter (neste 3 uker)
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState description="Ingen planlagte vakter de neste tre ukene." />
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-line">
              {upcoming.map((s, i) => (
                <li
                  key={`${s.work_date}-${i}`}
                  className="flex items-center gap-4 px-4 py-3 text-sm"
                >
                  <span className="w-44 text-fg">{fmtDay(s.work_date)}</span>
                  <span className="font-display font-bold text-fg">
                    {s.start_time}–{s.end_time}
                  </span>
                  {s.pause_start && s.pause_end && (
                    <span className="text-[12px] text-muted">
                      {s.pause_note || "Pause"} {s.pause_start}–{s.pause_end}
                    </span>
                  )}
                  <Badge tone="accent" className="ml-auto uppercase">
                    {parityLabel(s.week_parity)}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <p className="mt-2 text-[11px] text-muted">
          Utledet av turnusen din. Heldags fravær og registrert ferie er trukket
          fra. Ekstravakter for enkeltdatoer vises i egen liste over.
        </p>
      </section>
    </main>
  );
}
