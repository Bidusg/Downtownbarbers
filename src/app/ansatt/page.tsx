import { ProgressBar } from "@/components/ui/ProgressBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireRole, getUserRole } from "@/lib/auth";
import { getMyAgenda } from "@/lib/ansatt-queries";
import { getGoalProgress } from "@/lib/analytics-queries";
import { NoticeBanner } from "@/components/admin/NoticeBanner";
import { getActiveNotices } from "@/lib/notices-queries";
import { getMyDocuments } from "@/lib/staff-documents";
import Link from "next/link";

const MONTHS_NB = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
/** «2026-10» → «oktober 2026». */
function periodLabel(p: string | null): string {
  const m = /^(\d{4})-(\d{2})$/.exec(p ?? "");
  return m ? `${MONTHS_NB[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : "";
}

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
  const [me, agenda, notices, docs] = await Promise.all([
    getUserRole(),
    getMyAgenda(),
    getActiveNotices("ansatt"),
    getMyDocuments().catch(() => []),
  ]);
  // Siste lønnsoversikt – vises øverst de første 45 dagene etter at den kom.
  const latestSlip = docs
    .filter((d) => d.category === "lonnslipp")
    .sort((a, b) => (b.period ?? b.created_at).localeCompare(a.period ?? a.created_at))[0];
  const showSlip =
    !!latestSlip && new Date().getTime() - new Date(latestSlip.created_at).getTime() < 45 * 24 * 60 * 60 * 1000;

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
        {showSlip && latestSlip && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">Lønn</p>
                <p className="mt-1 font-semibold text-fg">
                  Lønnsoversikten for {periodLabel(latestSlip.period) || "forrige måned"} er klar
                </p>
              </div>
              <Link href="/ansatt/dokumenter#lonn" className="act act-accent">
                Se lønnsoversikten
              </Link>
            </div>
          </Card>
        )}
        {/* MIN TIMEPLAN */}
        <Card padded={false}>
          <div className="p-6">
            <h2 className="mb-4 font-display text-lg font-bold">Min timeplan</h2>
            {!agenda.linked ? (
              <p className="text-sm text-muted">
                Kontoen din ({me?.email}) er ikke koblet til en ansattprofil
                enda. Be admin sette e-posten din på din ansatt-rad, så dukker
                timene dine og tallene dine opp her.
              </p>
            ) : agenda.bookings.length === 0 ? (
              <EmptyState description="Ingen kommende timer akkurat nå." />
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
                          <span className="flex-1 text-sm text-fg">
                            {b.customer}
                          </span>
                          <span className="text-sm text-muted">{b.service}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Personlige tall – kun når kontoen er koblet til en barber-profil */}
        {agenda.linked && (
          <>
            {/* Månedsmål – ekte tall fra budsjett vs. omsetning, 0–100 % UTEN kroner */}
            <Card padded={false}>
              <div className="p-8">
                <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
                  Ditt månedsmål
                </p>
                {hasTarget ? (
                  <>
                    <div className="mt-4 mb-3 flex items-end justify-between">
                      <span className="font-display text-5xl font-bold text-fg sm:text-6xl">
                        {goalPct} %
                      </span>
                      <span className="pb-2 text-lg text-muted">
                        av målet ditt
                      </span>
                    </div>
                    <ProgressBar value={goalPct} />
                  </>
                ) : (
                  <EmptyState
                    className="mt-4"
                    description="Ingen mål satt for denne måneden enda. Be admin sette et omsetningsmål for deg under Budsjett, så vises fremdriften din her."
                  />
                )}
              </div>
            </Card>

            <StatTile
              label="Kommende timer"
              value={`${agenda.bookings.length}`}
              sub="registrerte bookinger"
            />

            <p className="text-center text-xs text-muted">
              Du ser kun ditt eget – aldri kolleger, omsetning eller budsjett.
            </p>
          </>
        )}
    </main>
  );
}
