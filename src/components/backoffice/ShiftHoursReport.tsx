import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getStaffShiftDays } from "@/lib/shift-hours";

const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

function hm(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h} t ${String(m).padStart(2, "0")} min`;
}

function dayLabel(iso: string): string {
  try {
    const t = new Date(`${iso}T12:00:00Z`).toLocaleDateString("nb-NO", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    return t.charAt(0).toUpperCase() + t.slice(1);
  } catch {
    return iso;
  }
}

/**
 * Stemplet arbeidstid per ansatt for en måned (fra stempelklokka i kassa).
 * Delt mellom admin og revisor. `basePath` brukes til måned-navigasjonen.
 */
export async function ShiftHoursReport({ month, basePath }: { month?: string; basePath: string }) {
  const now = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" }).slice(0, 7);
  const key = /^\d{4}-\d{2}$/.test(month ?? "") ? (month as string) : now;
  const [y, m] = key.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${key}-01`;
  const to = `${key}-${String(last).padStart(2, "0")}`;
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const label = `${MONTHS[m - 1]} ${y}`;

  const { rows, missingSql } = await getStaffShiftDays(from, to);

  const byStaff = new Map<string, { name: string; days: typeof rows; total: number; open: number }>();
  for (const r of rows) {
    const e = byStaff.get(r.staffId) ?? { name: r.name, days: [], total: 0, open: 0 };
    e.days.push(r);
    e.total += r.minutes;
    if (r.open) e.open += 1;
    byStaff.set(r.staffId, e);
  }
  const staff = [...byStaff.values()].sort((a, b) => a.name.localeCompare(b.name, "nb"));
  const grand = staff.reduce((s, x) => s + x.total, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Arbeidstid (stemplet)"
        description="Timene de ansatte stempler inn og ut på stempelklokka i kassa, per ansatt og dag. Pauser er trukket fra."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`${basePath}?m=${prev}`} className="act" aria-label="Forrige måned">
            ←
          </Link>
          <span className="min-w-36 text-center font-semibold first-letter:uppercase">{label}</span>
          <Link href={`${basePath}?m=${next}`} className="act" aria-label="Neste måned">
            →
          </Link>
        </div>
        {staff.length > 0 && (
          <span className="text-sm text-muted tabular-nums">Totalt {hm(grand)}</span>
        )}
      </div>

      {missingSql ? (
        <EmptyState description="Kjør KJØR-I-SUPABASE-TVERS-AV-ROLLER.sql i Supabase for å se stemplet arbeidstid." />
      ) : staff.length === 0 ? (
        <EmptyState description={`Ingen stemplinger i ${label}.`} />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {staff.map((s) => (
              <li key={s.name}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 hover:bg-surface-2">
                    <span>
                      <span className="block font-semibold text-fg">{s.name}</span>
                      <span className="block text-xs text-muted">
                        {s.days.length} dag{s.days.length === 1 ? "" : "er"}
                        {s.open > 0 ? ` · ${s.open} uten utstempling` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums">{hm(s.total)}</span>
                      <span className="text-muted transition-transform group-open:rotate-90" aria-hidden>
                        ›
                      </span>
                    </span>
                  </summary>
                  <table className="w-full text-sm">
                    <tbody>
                      {s.days.map((d) => (
                        <tr key={d.day} className="border-t border-line">
                          <td className="px-5 py-2 text-muted">{dayLabel(d.day)}</td>
                          <td className="px-5 py-2 text-right tabular-nums">
                            {hm(d.minutes)}
                            {d.open && <span className="ml-2 text-xs text-danger">ikke stemplet ut</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
