import {
  getMyStaffLink,
  getMyShiftDays,
  getMyShiftEvents,
} from "@/lib/ansatt-queries";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

function osloToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
}

function fmtHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} t ${m} min`;
}

function fmtDay(iso: string): string {
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

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("nb-NO", {
      timeZone: "Europe/Oslo",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function fmtDayTs(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("nb-NO", {
      timeZone: "Europe/Oslo",
      weekday: "long",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

// Mandag-basert ISO-uke som yyyy-Www (til gruppering).
function isoWeekKey(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-U${String(wk).padStart(2, "0")}`;
}

const EVENT_LABEL: Record<string, string> = {
  start: "Stemplet inn",
  pause: "Pause",
  resume: "Tilbake fra pause",
  end: "Stemplet ut",
};

export default async function AnsattTimer() {
  const to = osloToday();
  const from = isoDaysAgo(27); // 4 uker

  const [link, days, events] = await Promise.all([
    getMyStaffLink(),
    getMyShiftDays(from, to),
    getMyShiftEvents(from, to),
  ]);

  const totalMinutes = days.reduce((s, d) => s + d.worked_minutes, 0);

  // Sum per uke.
  const byWeek = new Map<string, number>();
  for (const d of days) {
    const k = isoWeekKey(d.day);
    byWeek.set(k, (byWeek.get(k) ?? 0) + d.worked_minutes);
  }
  const weeks = Array.from(byWeek.entries()).sort((a, b) =>
    b[0].localeCompare(a[0]),
  );

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <PageHeader
        title="Mine timer"
        description="Dine egne stemplede timer de siste fire ukene. Kun lesing."
      />

      {!link.linked ? (
        <div className="border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
          Kontoen din er ikke koblet til en ansattprofil enda. Be admin sette
          e-posten din på din ansatt-rad, så vises timene dine her.
        </div>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="border border-line bg-surface p-6">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
                Totalt siste 4 uker
              </p>
              <p className="mt-3 font-display text-4xl font-bold">
                {fmtHm(totalMinutes)}
              </p>
            </div>
            <div className="border border-line bg-surface p-6">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
                Per uke
              </p>
              {weeks.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Ingen registrerte timer.</p>
              ) : (
                <ul className="mt-3 space-y-1 text-sm">
                  {weeks.map(([k, mins]) => (
                    <li key={k} className="flex justify-between">
                      <span className="text-muted">{k.replace("-U", " · uke ")}</span>
                      <span className="font-display font-bold text-fg">
                        {fmtHm(mins)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <section>
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
              Per dag
            </h2>
            {days.length === 0 ? (
              <div className="border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
                Ingen stemplede timer i perioden.
              </div>
            ) : (
              <ul className="divide-y divide-line border border-line bg-surface">
                {days.map((d) => (
                  <li
                    key={d.day}
                    className="flex items-center justify-between px-4 py-3 text-sm"
                  >
                    <span className="text-fg">{fmtDay(d.day)}</span>
                    <span className="font-display font-bold text-fg">
                      {fmtHm(d.worked_minutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
              Stemplingslogg
            </h2>
            {events.length === 0 ? (
              <div className="border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
                Ingen stemplinger i perioden.
              </div>
            ) : (
              <ul className="divide-y divide-line border border-line bg-surface">
                {events.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-4 px-4 py-2.5 text-sm"
                  >
                    <span className="w-40 text-muted">
                      {fmtDayTs(e.created_at)}
                    </span>
                    <span className="font-display font-bold text-fg">
                      {fmtTime(e.created_at)}
                    </span>
                    <span className="ml-auto text-muted">
                      {EVENT_LABEL[e.event_type] ?? e.event_type}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-muted">
              Timene regnes ut fra inn-/utstempling. En glemt utstempling klippes
              ved døgnskillet. Spør admin ved feil.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
