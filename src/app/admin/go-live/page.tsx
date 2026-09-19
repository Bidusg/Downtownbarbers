import { requireRole } from "@/lib/auth";
import { getGoLiveChecklist, type CheckStatus } from "@/lib/go-live";

export const dynamic = "force-dynamic";

const STATUS: Record<CheckStatus, { label: string; cls: string; dot: string }> = {
  ok: { label: "Klar", cls: "bg-accent-soft/15 text-accent-soft", dot: "bg-accent-soft" },
  action: { label: "Handling", cls: "bg-surface-2 text-fg", dot: "bg-fg" },
  blocked: { label: "Blokkert", cls: "bg-danger/10 text-danger", dot: "bg-danger" },
  info: { label: "Info", cls: "bg-surface-2 text-muted", dot: "bg-muted" },
};

export default async function AdminGoLive() {
  await requireRole(["admin"]);
  const { groups, summary } = await getGoLiveChecklist();
  const pct = summary.total > 0 ? Math.round((summary.ok / summary.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Go-live sjekkliste</h1>
        <p className="mt-1 text-sm text-muted">
          Live status på alt som må på plass før full lansering. Oppdateres
          automatisk når nøkler/innstillinger settes.
        </p>
      </div>

      {/* Sammendrag */}
      <div className="border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-display text-3xl font-bold">
              {summary.ok}/{summary.total} <span className="text-base font-normal text-muted">klare</span>
            </p>
            <p className="mt-1 text-sm text-muted">
              {summary.action} trenger handling · {summary.blocked} blokkert
            </p>
          </div>
          <div className="w-full max-w-xs">
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent-soft" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-right text-xs text-muted">{pct}% klart</p>
          </div>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.title} className="border border-line bg-surface">
          <h2 className="border-b border-line px-6 py-4 font-display text-lg font-bold">
            {g.title}
          </h2>
          <div className="divide-y divide-line">
            {g.checks.map((c) => {
              const s = STATUS[c.status];
              return (
                <div key={c.key} className="flex flex-wrap items-start gap-4 px-6 py-4">
                  <span className={"mt-1.5 h-2 w-2 shrink-0 rounded-full " + s.dot} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-fg">{c.label}</span>
                      <span className={"rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " + s.cls}>
                        {s.label}
                      </span>
                      {c.owner && (
                        <span className="text-[10px] text-muted">· {c.owner}</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted">{c.detail}</p>
                    {c.hint && (
                      <p className="mt-1 text-sm text-fg-soft">→ {c.hint}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
