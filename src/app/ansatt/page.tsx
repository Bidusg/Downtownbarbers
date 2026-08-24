import { ProgressBar } from "@/components/ui/ProgressBar";
import { myStaff } from "@/lib/data/mock";
import { requireRole } from "@/lib/auth";

export default async function AnsattDashboard() {
  await requireRole(["staff", "admin"]);
  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
            Downtown Barbers
          </p>
          <p className="font-display text-lg font-bold">Min side</p>
        </div>
        <span className="rounded-full bg-accent-soft/15 px-3 py-1 text-xs font-semibold text-accent-soft">
          {myStaff.name}
        </span>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 p-6">
        {/* Månedsmål – 0–100 % UTEN kroner */}
        <section className="border border-line bg-surface p-8">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
            Ditt månedsmål
          </p>
          <div className="mt-4 mb-3 flex items-end justify-between">
            <span className="font-display text-6xl font-bold text-fg">
              {myStaff.monthProgressPct} %
            </span>
            <span className="pb-2 text-lg text-muted">av målet ditt</span>
          </div>
          <ProgressBar value={myStaff.monthProgressPct} />
          <p className="mt-4 text-sm text-muted">
            Du er godt i rute denne måneden. Fortsett det gode arbeidet! 💈
          </p>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border border-line bg-surface p-6">
            <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
              Din rating
            </p>
            <p className="mt-3 font-display text-4xl font-bold">
              {myStaff.rating.toFixed(1).replace(".", ",")}{" "}
              <span className="text-accent-soft">★</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              {myStaff.ratingCount} vurderinger
            </p>
          </div>
          <div className="border border-line bg-surface p-6">
            <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
              Bookinger denne uken
            </p>
            <p className="mt-3 font-display text-4xl font-bold">
              {myStaff.bookingsThisWeek}
            </p>
            <p className="mt-1 text-xs text-muted">fullførte timer</p>
          </div>
        </div>

        <p className="text-center text-xs text-muted">
          Du ser kun ditt eget – aldri kolleger, omsetning eller budsjett.
        </p>
      </main>
    </div>
  );
}
