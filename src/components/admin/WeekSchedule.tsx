import { colorAt } from "@/lib/colors";
import type { StaffHour, StaffOption } from "@/lib/ops-queries";

const DAYS = [
  { n: 1, l: "Man" },
  { n: 2, l: "Tir" },
  { n: 3, l: "Ons" },
  { n: 4, l: "Tor" },
  { n: 5, l: "Fre" },
  { n: 6, l: "Lør" },
  { n: 0, l: "Søn" },
];
const BASE = 9 * 60; // 09:00
const SPAN = 12 * 60; // 09–21

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// "09:00" → "9", "09:30" → "9:30" (kompakt for smale celler)
function compact(t: string) {
  const [h, m] = t.split(":");
  return m === "00" ? String(Number(h)) : `${Number(h)}:${m}`;
}

/**
 * Visuell ukeplan (turnus): én rad per barber, én kolonne per ukedag,
 * med arbeidstiden tegnet som fargede bånd på en 09–21-skala.
 */
export function WeekSchedule({
  hours,
  staff,
  parity = 1,
}: {
  hours: StaffHour[];
  staff: StaffOption[];
  /** Hvilken uke som vises: 1 = uke A, 2 = uke B. Rader for "hver uke" (0) vises alltid. */
  parity?: 1 | 2;
}) {
  if (staff.length === 0) return null;
  const cols = "120px repeat(7, minmax(72px, 1fr))";

  return (
    <div className="mb-8 overflow-x-auto border border-line bg-surface">
      <div className="min-w-[760px]">
        {/* Header */}
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          <div className="bg-surface-2 px-3 py-2 text-xs font-semibold tracking-wide text-muted uppercase">
            Barber
          </div>
          {DAYS.map((d) => (
            <div
              key={d.n}
              className="border-l border-line bg-surface-2 px-2 py-2 text-center text-xs font-semibold tracking-wide text-muted uppercase"
            >
              {d.l}
            </div>
          ))}
        </div>

        {/* Rader */}
        {staff.map((s, i) => {
          const color = colorAt(i);
          return (
            <div
              key={s.id}
              className="grid items-center border-t border-line"
              style={{ gridTemplateColumns: cols }}
            >
              <div className="truncate px-3 py-2 text-sm font-medium text-fg">
                {s.full_name}
              </div>
              {DAYS.map((d) => {
                const shifts = hours.filter(
                  (h) =>
                    h.staff_id === s.id &&
                    h.weekday === d.n &&
                    (h.week_parity === 0 || h.week_parity === parity),
                );
                return (
                  <div key={d.n} className="border-l border-line px-1.5 py-2">
                    <div className="relative h-6 overflow-hidden rounded bg-surface-2/50">
                      {shifts.map((h, j) => {
                        const a = toMin(h.start_time);
                        const b = toMin(h.end_time);
                        const left = Math.max(0, ((a - BASE) / SPAN) * 100);
                        const width = Math.max(
                          6,
                          Math.min(100 - left, ((b - a) / SPAN) * 100),
                        );
                        return (
                          <div
                            key={j}
                            title={`${h.start_time}–${h.end_time}`}
                            className="absolute top-0 flex h-6 items-center justify-center rounded"
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              background: color,
                            }}
                          >
                            <span className="truncate px-1 text-[10px] font-semibold text-[#211E1A]">
                              {compact(h.start_time)}–{compact(h.end_time)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="border-t border-line px-3 py-1.5 text-[10px] text-muted">
        Tidsskala 09–21. Endre tider i redigeringen under.
      </p>
    </div>
  );
}
