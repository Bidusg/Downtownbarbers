import Link from "next/link";
import { getCustomerMembershipByToken, remainingToNext } from "@/lib/membership-queries";
import { TierBadge } from "@/components/membership/TierBadge";
import { UpcomingBookings } from "@/components/portal/UpcomingBookings";
import { T, TDyn, TF } from "@/lib/i18n/T";
import { PortalDate } from "@/components/portal/PortalDate";
import { PublicPage } from "@/components/site/PublicPage";

/* Selve Min side-visningen (data hentes i app/min-side/[token]/page.tsx). */

type Booking = {
  id: string;
  start_at: string;
  status: string;
  price_nok: number;
  service: string | null;
  barber: string | null;
};
export type Portal = {
  full_name: string;
  member_since: string;
  visits: number;
  total_spent: number;
  loyalty: { progress?: number; required?: number; reward_due?: boolean } | null;
  bookings: Booking[];
};

const STATUS_KEYS = new Set(["pending", "confirmed", "completed", "cancelled", "no_show"]);
const NF = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
const nok = (n: number) => `${NF.format(Math.round(n))} kr`;
const TILE = "rounded-[28px] bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_-24px_rgba(0,0,0,0.18)] sm:p-8";

export function PortalView({
  token,
  p,
  addonsByBooking,
  membership,
}: {
  token: string;
  p: Portal;
  addonsByBooking: Map<string, string[]>;
  membership: Awaited<ReturnType<typeof getCustomerMembershipByToken>>;
}) {
  const membershipLeft = membership ? remainingToNext(membership) : null;
  const now = Date.now();
  const upcoming = p.bookings
    .filter((b) => new Date(b.start_at).getTime() >= now && b.status !== "cancelled" && b.status !== "no_show")
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  const history = p.bookings.filter((b) => !upcoming.includes(b));

  const required = Math.max(1, Number(p.loyalty?.required ?? 10));
  const progress = Math.min(required, Number(p.loyalty?.progress ?? 0));
  const rewardDue = Boolean(p.loyalty?.reward_due);
  const stamps = Array.from({ length: Math.min(required, 12) }, (_, i) => i < progress);
  const first = p.full_name.trim().split(/\s+/)[0] ?? "";

  return (
    <PublicPage>
      {/* Topp */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="m-eyebrow">
            <T k="portal.eyebrow" />
          </p>
          <h1 className="m-title mt-2 text-4xl sm:text-6xl">
            <TF k="portal.hiName" vars={{ name: first }} />
          </h1>
          <p className="mt-3 text-muted">
            <T k="portal.memberSince" /> <PortalDate iso={p.member_since} />
          </p>
        </div>
        <a href="/booking" className="pill pill-primary self-start sm:self-auto">
          <T k="common.bookNew" />
        </a>
      </div>

      {/* Kommende timer – med selvbetjening (avbestill / endre tid) */}
      <section className="mt-12" aria-labelledby="pt-upcoming">
        <h2 id="pt-upcoming" className="text-xl font-semibold tracking-tight">
          <T k="portal.upcoming" />
        </h2>
        <UpcomingBookings
          token={token}
          bookings={upcoming.map((b) => ({
            id: b.id,
            start_at: b.start_at,
            service: b.service,
            barber: b.barber,
            addons: addonsByBooking.get(b.id),
          }))}
        />
      </section>

      {/* Klippekort + medlemskap */}
      <div className="mt-12 grid gap-5 md:grid-cols-2">
        <section
          aria-labelledby="pt-loyalty"
          className="relative overflow-hidden rounded-[28px] bg-fg p-6 text-canvas shadow-[0_24px_60px_-30px_rgba(0,0,0,0.6)] sm:p-8"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] text-canvas/60">Downtown Barbers</p>
              <h2 id="pt-loyalty" className="mt-0.5 text-xl font-semibold tracking-tight">
                <T k="portal.loyalty" />
              </h2>
            </div>
            {rewardDue ? (
              <span className="rounded-full bg-accent-soft px-3 py-1 text-[13px] font-semibold text-[#1d1a17]">
                <T k="portal.rewardDue" />
              </span>
            ) : (
              <span className="text-[15px] font-semibold tabular-nums">
                {progress} <T k="portal.stampsOf" /> {required}
              </span>
            )}
          </div>
          <ol className="mt-6 flex flex-wrap gap-2.5" aria-label={`${progress} / ${required}`}>
            {stamps.map((filled, i) => (
              <li
                key={i}
                className={
                  "flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums " +
                  (filled ? "bg-accent-soft text-[#1d1a17]" : "text-canvas/50 shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.25)]")
                }
              >
                <span className="sr-only">
                  <T k="portal.stampN" /> {i + 1}
                </span>
                <span aria-hidden>{filled ? "✓" : i + 1}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-canvas/70">
            {rewardDue ? (
              <T k="portal.rewardHint" />
            ) : (
              <>
                <T k="portal.moreVisits.pre" /> {required - progress} <T k="portal.moreVisits.post" />
              </>
            )}
          </p>
        </section>

        {membership ? (
          <section aria-labelledby="pt-member" className={TILE}>
            <div className="flex items-start justify-between gap-3">
              <h2 id="pt-member" className="text-xl font-semibold tracking-tight">
                <T k="portal.membership" />
              </h2>
              <TierBadge name={membership.tierName} color={membership.color} />
            </div>
            {membership.benefit && (
              <p className="mt-4 text-[15px] text-fg">
                <span className="text-muted">
                  <T k="portal.benefit" />
                </span>
                {membership.benefit}
              </p>
            )}
            <p className="mt-4 text-sm text-muted tabular-nums">
              {nok(membership.spend)} · {membership.visits} <T k="portal.completedVisits" />
            </p>
            {membership.nextTierName && membershipLeft ? (
              <p className="mt-4 border-t border-line pt-4 text-[15px] text-fg tabular-nums">
                {membershipLeft.spendLeft > 0 ? nok(membershipLeft.spendLeft) : "0 kr"} <T k="portal.or" />{" "}
                {Math.max(0, membershipLeft.visitsLeft)} <T k="portal.visitsLeftTo" />{" "}
                <span className="font-semibold">{membership.nextTierName}</span>.
              </p>
            ) : (
              <p className="mt-4 border-t border-line pt-4 text-[15px] font-semibold text-fg">
                <T k="portal.topTier" />
              </p>
            )}
          </section>
        ) : (
          <section aria-labelledby="pt-stats" className={TILE}>
            <h2 id="pt-stats" className="text-xl font-semibold tracking-tight">
              <T k="portal.atUs" />
            </h2>
            <dl className="mt-6 grid grid-cols-2 gap-4">
              <div className="flex flex-col-reverse">
                <dt className="mt-1 text-sm text-muted">
                  <T k="portal.completedVisits" />
                </dt>
                <dd className="m-title text-4xl tabular-nums">{p.visits}</dd>
              </div>
              <div className="flex flex-col-reverse">
                <dt className="mt-1 text-sm text-muted">
                  <T k="portal.spentWithUs" />
                </dt>
                <dd className="m-title text-4xl tabular-nums">{nok(p.total_spent)}</dd>
              </div>
            </dl>
          </section>
        )}
      </div>

      {/* Historikk */}
      <section className="mt-12" aria-labelledby="pt-history">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="pt-history" className="text-xl font-semibold tracking-tight">
            <T k="portal.history" />
          </h2>
          {p.visits > 0 && (
            <a href={`/min-side/${token}/kjopshistorikk`} className="m-link min-h-11 text-[15px]">
              <T k="portal.downloadHistory" />
            </a>
          )}
        </div>
        <div className={TILE + " mt-4 !p-2 sm:!p-3"}>
          {history.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted">
              <T k="portal.noHistory" />
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {history.slice(0, 30).map((b) => {
                const rebook = b.service
                  ? `/booking?service=${encodeURIComponent(b.service)}${b.barber ? `&barber=${encodeURIComponent(b.barber)}` : ""}`
                  : "/booking";
                const addons = addonsByBooking.get(b.id) ?? [];
                const muted = b.status === "cancelled" || b.status === "no_show";
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-4">
                    <div className="min-w-0">
                      <p className={"font-medium " + (muted ? "text-muted line-through" : "text-fg")}>
                        {b.service ? <TDyn text={b.service} map="services" /> : <T k="portal.appointment" />}
                      </p>
                      <p className="mt-0.5 text-sm text-muted tabular-nums">
                        <PortalDate iso={b.start_at} />
                        {b.barber ? ` · ${b.barber}` : ""}
                        {" · "}
                        {STATUS_KEYS.has(b.status) ? <T k={`portal.status.${b.status}`} /> : b.status}
                      </p>
                      {addons.length > 0 && (
                        <p className="text-sm text-muted">
                          +{" "}
                          {addons.map((a, i) => (
                            <span key={a}>
                              {i > 0 ? ", " : ""}
                              <TDyn text={a} map="services" />
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                    <Link href={rebook} className="pill pill-soft pill-sm shrink-0">
                      <T k="portal.rebook" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </PublicPage>
  );
}
