import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireRole } from "@/lib/auth";
import { getMyAgenda } from "@/lib/ansatt-queries";
import { dayLabel, nowMs, osloDate, osloTime } from "@/lib/ansatt-format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mine bookinger | Downtown Barbers" };

/** Alle kommende bookinger hos den innloggede ansatte, gruppert per dag. */
export default async function MineBookinger() {
  await requireRole(["staff", "admin"]);
  const agenda = await getMyAgenda();
  const today = osloDate();
  const now = nowMs();
  const list = agenda.bookings.filter((b) => b.status !== "cancelled");

  const byDay = new Map<string, typeof list>();
  for (const b of list) {
    const k = osloDate(b.start_at);
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(b);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:p-6">
      <PageHeader title="Mine bookinger" description={`${list.length} kommende`} />
      {!agenda.linked ? (
        <EmptyState description="Kontoen din er ikke koblet til en ansattprofil enda. Be admin sette e-posten din på ansatt-raden din." />
      ) : list.length === 0 ? (
        <EmptyState description="Ingen kommende bookinger akkurat nå." />
      ) : (
        Array.from(byDay.entries()).map(([day, rows]) => (
          <section key={day}>
            <h2 className="mb-2 flex items-baseline justify-between px-1">
              <span className="text-[13px] font-semibold tracking-wide text-accent-soft uppercase">
                {dayLabel(day, today)}
              </span>
              <span className="text-xs text-muted">
                {rows.length} {rows.length === 1 ? "kunde" : "kunder"}
              </span>
            </h2>
            <ul className="overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_oklch(var(--line))]">
              {rows.map((b) => {
                const past = Date.parse(b.start_at) < now;
                return (
                  <li
                    key={b.id}
                    className={"flex items-center gap-4 border-b border-line px-4 py-3 last:border-0 " + (past ? "opacity-50" : "")}
                  >
                    <span className="w-12 shrink-0 font-display text-[15px] font-bold tabular-nums text-fg">
                      {osloTime(b.start_at)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-fg">{b.customer}</span>
                      <span className="block truncate text-[13px] text-muted">{b.service}</span>
                    </span>
                    {b.status === "no_show" && (
                      <span className="rounded bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">Ikke møtt</span>
                    )}
                    {b.status === "completed" && (
                      <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">Ferdig</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
