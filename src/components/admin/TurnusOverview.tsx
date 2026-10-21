import type { StaffHour, StaffOption } from "@/lib/ops-queries";
import { parityLabel, parityOptions } from "@/lib/turnus";

const DAYS = [
  { n: 1, l: "Man" },
  { n: 2, l: "Tir" },
  { n: 3, l: "Ons" },
  { n: 4, l: "Tor" },
  { n: 5, l: "Fre" },
  { n: 6, l: "Lør" },
  { n: 0, l: "Søn" },
];

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const dm = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`;

/** Farge etter starttid: tidlig / mellom / sen. */
function tone(start: string) {
  const m = toMin(start);
  if (m <= 10 * 60 + 15) return "bg-[#FDE7D3]";
  if (m < 12 * 60) return "bg-[#E3EEF9]";
  if (m < 15 * 60) return "bg-[#E5F1E1]";
  return "bg-[#EDE3F6]";
}

/**
 * «Uke for uke»: én tabell per ansatt med en rad per turnusuke og en kolonne
 * per ukedag – hele rotasjonen på ett blikk, med timer per uke.
 */
export function TurnusOverview({
  hours,
  staff,
  weeks,
  currentIndex,
}: {
  hours: StaffHour[];
  staff: StaffOption[];
  weeks: number;
  currentIndex: number;
}) {
  const idx = weeks > 1 ? parityOptions(weeks) : [1];

  return (
    <div className="mb-8 space-y-6">
      {staff.map((s) => {
        const mine = hours.filter((h) => h.staff_id === s.id);
        return (
          <div key={s.id} className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5">
              <p className="font-semibold text-fg">{s.full_name}</p>
              <p className="text-xs text-muted">
                {mine.length === 0 ? "Ingen turnus satt" : `${mine.length} vakter i turnusen`}
              </p>
            </div>
            {mine.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs">
                  <thead className="bg-surface-2 text-muted">
                    <tr>
                      <th className="w-20 px-2 py-1.5 text-left font-semibold">Uke</th>
                      {DAYS.map((d) => (
                        <th key={d.n} className="px-1 py-1.5 font-semibold">
                          {d.l}
                        </th>
                      ))}
                      <th className="w-14 px-2 py-1.5 text-right font-semibold">Timer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {idx.map((w) => {
                      let total = 0;
                      const cells = DAYS.map((d) => {
                        const list = mine
                          .filter((h) => h.weekday === d.n && (h.week_parity === 0 || h.week_parity === w))
                          .sort((a, b) => a.start_time.localeCompare(b.start_time));
                        for (const h of list) {
                          let min = toMin(h.end_time) - toMin(h.start_time);
                          if (h.pause_start && h.pause_end) min -= toMin(h.pause_end) - toMin(h.pause_start);
                          // Tell bare vakter som gjelder (ikke de som avsluttes/kommer)
                          if (!h.valid_to) total += min / 60;
                        }
                        return (
                          <td key={d.n} className="px-1 py-1 align-top">
                            {list.length === 0 ? (
                              <div className="rounded px-1 py-1.5 text-center text-muted/70">Fri</div>
                            ) : (
                              <div className="space-y-1">
                                {list.map((h) => (
                                  <div
                                    key={h.id}
                                    className={
                                      "rounded px-1 py-1 text-center text-[#211E1A] " +
                                      tone(h.start_time) +
                                      (h.valid_to ? " opacity-50" : "")
                                    }
                                    title={h.week_parity === 0 ? "Gjelder hver uke" : parityLabel(h.week_parity)}
                                  >
                                    <div className="font-semibold">
                                      {h.start_time}–{h.end_time}
                                    </div>
                                    {h.pause_start && h.pause_end && (
                                      <div className="text-[10px]">pause {h.pause_start}–{h.pause_end}</div>
                                    )}
                                    {h.valid_from && h.valid_from > new Date().toISOString().slice(0, 10) && (
                                      <div className="text-[10px]">fra {dm(h.valid_from)}</div>
                                    )}
                                    {h.valid_to && <div className="text-[10px]">til {dm(h.valid_to)}</div>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      });
                      return (
                        <tr key={w} className={weeks > 1 && w === currentIndex ? "bg-accent-soft/5" : ""}>
                          <td className="px-2 py-1 font-semibold text-fg">
                            {weeks > 1 ? parityLabel(w) : "Hver uke"}
                            {weeks > 1 && w === currentIndex && (
                              <span className="block text-[10px] font-normal text-accent-soft">denne uken</span>
                            )}
                          </td>
                          {cells}
                          <td className="px-2 py-1 text-right font-semibold text-fg">
                            {Math.round(total * 10) / 10}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
