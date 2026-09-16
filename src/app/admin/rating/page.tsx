import { getRatingOverview } from "@/lib/rating-queries";
import { getReviewsSummary, getReviewConfigAdmin } from "@/lib/reviews";
import { ReviewConfigForm } from "@/components/admin/ReviewConfigForm";

export const dynamic = "force-dynamic";

function Stars({ n }: { n: number }) {
  const full = Math.round(n);
  return (
    <span className="text-accent-soft">
      {"★".repeat(full)}
      <span className="text-line-2">{"★".repeat(Math.max(0, 5 - full))}</span>
    </span>
  );
}

const nf = (n: number) => n.toFixed(1).replace(".", ",");

function sourceBadge(key: string): string {
  if (key === "google") return "G";
  if (key === "tripadvisor") return "TA";
  return "★";
}

export default async function AdminRating() {
  const overview = await getRatingOverview();
  const summary = await getReviewsSummary({
    rating: overview.totalAvg,
    count: overview.totalCount,
    recent: overview.comments.map((c) => ({
      barber: c.barber,
      stars: c.stars,
      text: c.text,
      createdAt: c.createdAt,
    })),
  });
  const reviewConfig = await getReviewConfigAdmin();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <h1 className="font-display text-2xl font-bold">Rating & omdømme</h1>

      {/* ---------- Samlet omdømme (alle kilder) ---------- */}
      <div className="border border-line bg-surface p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold">Samlet omdømme</h2>
            <p className="mt-1 text-sm text-muted">
              Antalls-vektet snitt på tvers av Google, TripAdvisor og egne kunder.
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-4xl font-bold">
              {summary.blendedCount > 0 ? nf(summary.blendedRating) : "—"}{" "}
              <span className="text-accent-soft">★</span>
            </p>
            <p className="text-xs text-muted">
              {summary.blendedCount} vurderinger totalt
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {summary.sources.map((s) => (
            <div key={s.key} className="border border-line bg-surface-2 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide text-muted uppercase">
                  {s.label}
                </span>
                <span className="flex h-5 min-w-5 items-center justify-center rounded bg-accent-soft/15 px-1 text-[10px] font-bold text-accent-soft">
                  {sourceBadge(s.key)}
                </span>
              </div>
              {s.count > 0 ? (
                <>
                  <p className="mt-2 font-display text-2xl font-bold">
                    {nf(s.rating)} <span className="text-accent-soft">★</span>
                  </p>
                  <p className="text-xs text-muted">
                    {s.count} vurderinger
                    {s.url && (
                      <>
                        {" · "}
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-soft hover:underline"
                        >
                          se
                        </a>
                      </>
                    )}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">Ingen vurderinger enda</p>
              )}
            </div>
          ))}
        </div>

      </div>

      {/* ---------- Koble til kilder ---------- */}
      <div className="border border-line bg-surface p-6">
        <ReviewConfigForm status={reviewConfig} />
      </div>

      {/* ---------- Snittrating per barber (egne kunder) ---------- */}
      <div className="border border-line bg-surface p-6">
        <h2 className="mb-1 font-display text-lg font-bold">Snittrating per barber</h2>
        <p className="mb-5 text-sm text-muted">
          Fra egne kunder som vurderer etter fullført time.
        </p>
        {overview.perBarber.length === 0 ? (
          <p className="text-sm text-muted">
            Ingen kundevurderinger enda. De dukker opp her når kunder vurderer via
            lenken de får etter en fullført time.
          </p>
        ) : (
          <div className="space-y-4">
            {overview.perBarber.map((b) => (
              <div key={b.staffId} className="flex items-center gap-4">
                <span className="w-28 text-sm font-medium text-fg">{b.name}</span>
                <div className="h-2 flex-1 overflow-hidden bg-surface-2">
                  <div
                    className="h-full bg-accent-soft"
                    style={{ width: `${(b.avg / 5) * 100}%` }}
                  />
                </div>
                <span className="w-32 text-right font-display text-sm">
                  {nf(b.avg)} <span className="text-accent-soft">★</span>
                  <span className="ml-1 text-xs text-muted">({b.count})</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- Siste tilbakemeldinger (alle kilder) ---------- */}
      <div className="border border-line bg-surface p-6">
        <h2 className="mb-5 font-display text-lg font-bold">Siste tilbakemeldinger</h2>
        {summary.recent.length === 0 ? (
          <p className="text-sm text-muted">
            Ingen skriftlige tilbakemeldinger enda.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {summary.recent.map((c, i) => (
              <li key={i} className="flex items-start justify-between gap-4 py-4">
                <div>
                  <p className="text-sm text-fg">{c.text}</p>
                  <p className="mt-1 text-xs text-muted">
                    {c.author} · {c.sourceLabel}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <Stars n={c.rating} />
                  <p className="mt-1 text-xs text-muted">
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {c.when || "se"}
                      </a>
                    ) : (
                      c.when
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
