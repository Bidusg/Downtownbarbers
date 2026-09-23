import { ProgressBar } from "@/components/ui/ProgressBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole, getUserRole } from "@/lib/auth";
import { getMyAgenda } from "@/lib/ansatt-queries";
import { getGoalProgress } from "@/lib/analytics-queries";
import { NoticeBanner } from "@/components/admin/NoticeBanner";
import { getActiveNotices } from "@/lib/notices-queries";

export const dynamic = "force-dynamic";

function fmtDay(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("nb-NO", {
      weekday: "long",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}
function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("nb-NO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default async function AnsattDashboard() {
  await requireRole(["staff", "admin"]);
  const [me, agenda, notices] = await Promise.all([
    getUserRole(),
    getMyAgenda(),
    getActiveNotices("ansatt"),
  ]);

  // Ekte månedsmål for innlogget barber (kun når kontoen er koblet til en profil).
  const now = new Date();
  const goal = agenda.linked
    ? await getGoalProgress(now.getFullYear(), now.getMonth() + 1)
    : null;
  const myGoal = goal?.rows.find((r) => r.staffId === agenda.staffId) ?? null;
  const hasTarget = (myGoal?.target ?? 0) > 0;
  const goalPct = myGoal?.pct ?? 0;

  // Grupper timer per dag
  const byDay = new Map<string, typeof agenda.bookings>();
  for (const b of agenda.bookings) {
    const key = fmtDay(b.start_at);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(b);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
        <PageHeader title="Min side" />
        <NoticeBanner notices={notices} />
        {/* MIN TIMEPLAN */}
        <section className="border border-line bg-surface p-6">
          <h2 className="mb-4 font-display text-lg font-bold">Min timeplan</h2>
          {!agenda.linked ? (
            <p className="text-sm text-muted">
              Kontoen din ({me?.email}) er ikke koblet til en ansattprofil enda.
              Be admin sette e-posten din på din ansatt-rad, så dukker timene
              dine og tallene dine opp her.
            </p>
          ) : agenda.bookings.length === 0 ? (
            <p className="text-sm text-muted">Ingen kommende timer akkurat nå.</p>
          ) : (
            <div className="space-y-5">
              {Array.from(byDay.entries()).map(([day, list]) => (
                <div key={day}>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-accent-soft uppercase">
                    {day}
                  </p>
                  <ul className="divide-y divide-line">
                    {list.map((b) => (
                      <li key={b.id} className="flex items-center gap-4 py-3">
                        <span className="font-display text-sm font-bold text-fg">
                          {fmtTime(b.start_at)}
                        </span>
                        <span className="flex-1 text-sm text-fg">{b.customer}</span>
                        <span className="text-sm text-muted">{b.service}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Personlige tall – kun når kontoen er koblet til en barber-profil */}
        {agenda.linked && (
          <>
            {/* Månedsmål – ekte tall fra budsjett vs. omsetning, 0–100 % UTEN kroner */}
            <section className="border border-line bg-surface p-8">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
                Ditt månedsmål
              </p>
              {hasTarget ? (
                <>
                  <div className="mt-4 mb-3 flex items-end justify-between">
                    <span className="font-display text-6xl font-bold text-fg">
                      {goalPct} %
                    </span>
                    <span className="pb-2 text-lg text-muted">av målet ditt</span>
                  </div>
                  <ProgressBar value={goalPct} />
                </>
              ) : (
                <p className="mt-4 text-sm text-muted">
                  Ingen mål satt for denne måneden enda. Be admin sette et
                  omsetningsmål for deg under Budsjett, så vises fremdriften din
                  her.
                </p>
              )}
            </section>

            <div className="border border-line bg-surface p-6">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
                Kommende timer
              </p>
              <p className="mt-3 font-display text-4xl font-bold">
                {agenda.bookings.length}
              </p>
              <p className="mt-1 text-xs text-muted">registrerte bookinger</p>
            </div>

            <p className="text-center text-xs text-muted">
              Du ser kun ditt eget – aldri kolleger, omsetning eller budsjett.
            </p>
          </>
        )}
    </main>
  );
}
