import { ProgressBar } from "@/components/ui/ProgressBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireRole, getUserRole } from "@/lib/auth";
import { getMyAgenda, getMyUpcomingShifts } from "@/lib/ansatt-queries";
import { dayLabel, firstName, nowMs, osloDate, osloTime } from "@/lib/ansatt-format";
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
  const [me, agenda, notices, docs, shifts] = await Promise.all([
    getUserRole(),
    getMyAgenda(),
    getActiveNotices("ansatt"),
    getMyDocuments().catch(() => []),
    getMyUpcomingShifts(21),
  ]);

  // ---- I dag: vakt, opplæring, kunder ----
  const today = osloDate();
  const nowT = nowMs();
  const nowHHMM = new Date().toLocaleTimeString("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
  const todayShifts = shifts.filter((s) => s.work_date === today);
  const nextShift = shifts.find((s) => s.work_date > today || (s.work_date === today && s.end_time > nowHHMM));
  const training = todayShifts.find((s) => s.pause_start && s.pause_end && s.pause_note);
  const active = agenda.bookings.filter((b) => b.status !== "cancelled");
  const todayList = active.filter((b) => osloDate(b.start_at) === today);
  const nextUp = todayList.filter((b) => Date.parse(b.start_at) >= nowT - 15 * 60000);
  const greeting = (() => {
    const h = Number(nowHHMM.slice(0, 2));
    return h < 10 ? "God morgen" : h < 17 ? "Hei" : "God kveld";
  })();
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
  // Forsiden viser de neste 6 – resten ligger under «Bookinger».
  const byDay = new Map<string, typeof agenda.bookings>();
  for (const b of active.filter((x) => Date.parse(x.start_at) >= nowT - 15 * 60000).slice(0, 6)) {
    const key = dayLabel(osloDate(b.start_at), today);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(b);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:space-y-8 sm:p-6">
        <div>
          <p className="text-[13px] font-medium text-muted first-letter:uppercase">
            {new Date().toLocaleDateString("nb-NO", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "long" })}
          </p>
          <PageHeader title={`${greeting}${agenda.staffName ? `, ${firstName(agenda.staffName)}` : ""}`} />
        </div>

        {/* I DAG – vakt, opplæring og kunder på ett blikk */}
        {agenda.linked && (
          <section className="overflow-hidden rounded-3xl bg-fg text-canvas shadow-[0_20px_50px_-24px_rgb(0_0_0/0.5)]">
            <div className="grid grid-cols-2 divide-x divide-canvas/15">
              <div className="p-5">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-canvas/60 uppercase">Vakt i dag</p>
                <p className="mt-1 font-display text-xl font-bold whitespace-nowrap tabular-nums sm:text-2xl">
                  {todayShifts.length ? todayShifts.map((s) => `${s.start_time}–${s.end_time}`).join(", ") : "Fri"}
                </p>
                {!todayShifts.length && nextShift && (
                  <p className="mt-1 text-[13px] text-canvas/70">
                    Neste: {dayLabel(nextShift.work_date, today).toLowerCase()} {nextShift.start_time}
                  </p>
                )}
              </div>
              <div className="p-5">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-canvas/60 uppercase">Kunder i dag</p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums">{todayList.length}</p>
                {nextUp[0] && (
                  <p className="mt-1 truncate text-[13px] text-canvas/70">
                    Neste: {osloTime(nextUp[0].start_at)} · {nextUp[0].customer}
                  </p>
                )}
              </div>
            </div>
            {training && (
              <div className="flex items-center gap-3 border-t border-canvas/15 bg-accent-soft/90 px-5 py-3 text-[14px] font-semibold text-white">
                <span aria-hidden>📘</span>
                {training.pause_note} {training.pause_start}–{training.pause_end}
              </div>
            )}
          </section>
        )}

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
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-bold">Kommende kunder</h2>
              {agenda.linked && active.length > 0 && (
                <Link href="/ansatt/bookinger" className="text-sm font-semibold text-accent-soft">
                  Se alle ({active.length}) →
                </Link>
              )}
            </div>
            {!agenda.linked ? (
              <p className="text-sm text-muted">
                Kontoen din ({me?.email}) er ikke koblet til en ansattprofil
                enda. Be admin sette e-posten din på din ansatt-rad, så dukker
                timene dine og tallene dine opp her.
              </p>
            ) : byDay.size === 0 ? (
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
              value={`${active.length}`}
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
