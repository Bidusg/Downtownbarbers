import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCustomerMembershipByToken, remainingToNext } from "@/lib/membership-queries";
import { TierBadge } from "@/components/membership/TierBadge";
import { UpcomingBookings } from "@/components/portal/UpcomingBookings";
import { T, TDyn } from "@/lib/i18n/T";
import { PortalDate } from "@/components/portal/PortalDate";

export const dynamic = "force-dynamic";

type Booking = {
  id: string;
  start_at: string;
  status: string;
  price_nok: number;
  service: string | null;
  barber: string | null;
};
type Portal = {
  full_name: string;
  member_since: string;
  visits: number;
  total_spent: number;
  loyalty: { progress?: number; required?: number; reward_due?: boolean } | null;
  bookings: Booking[];
};

const STATUS_KEYS = new Set(["pending", "confirmed", "completed", "cancelled", "no_show"]);
const nok = (n: number) => Math.round(n).toLocaleString("nb-NO") + " kr";

function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-5 py-16">
      <div className="w-full border border-line bg-surface p-8 text-center">
        <h1 className="font-display text-2xl font-bold text-fg"><T k="portal.notFoundTitle" /></h1>
        <p className="mt-3 text-sm text-muted"><T k="portal.linkInvalid" /></p>
        <Link href="/" className="mt-6 inline-block text-sm text-accent-soft hover:underline"><T k="common.toFront" /></Link>
      </div>
    </main>
  );
}

export default async function MinSide({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return <NotFound />;

  const sb = await createClient();
  const { data } = await sb.rpc("customer_portal", { p_token: token });
  const p = (Array.isArray(data) ? data[0] : data) as Portal | null;
  if (!p || !p.full_name) return <NotFound />;

  // Tillegg per booking (handlekurv) – egen SECURITY DEFINER-RPC via token.
  const { data: addonRows } = await sb.rpc("customer_portal_addons", { p_token: token });
  const addonsByBooking = new Map<string, string[]>();
  for (const r of (addonRows ?? []) as { booking_id: string; name: string }[]) {
    const list = addonsByBooking.get(r.booking_id) ?? [];
    list.push(r.name);
    addonsByBooking.set(r.booking_id, list);
  }

  const membership = await getCustomerMembershipByToken(token);
  const membershipLeft = membership ? remainingToNext(membership) : null;

  const now = Date.now();
  const upcoming = p.bookings.filter(
    (b) => new Date(b.start_at).getTime() >= now && b.status !== "cancelled" && b.status !== "no_show",
  );
  const history = p.bookings.filter((b) => !upcoming.includes(b));

  const required = Math.max(1, Number(p.loyalty?.required ?? 10));
  const progress = Math.min(required, Number(p.loyalty?.progress ?? 0));
  const rewardDue = Boolean(p.loyalty?.reward_due);
  const stamps = Array.from({ length: Math.min(required, 12) }, (_, i) => i < progress);

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <div className="mb-8 text-center">
        <p className="text-[11px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
          Downtown Barbers
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-fg">
          <T k="portal.hi" /> {p.full_name.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-muted">
          <T k="portal.memberSince" /> <PortalDate iso={p.member_since} />
        </p>
      </div>

      {/* Klippekort */}
      <div className="mb-6 border border-line bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold"><T k="portal.loyalty" /></h2>
          {rewardDue ? (
            <span className="bg-accent-soft/15 px-3 py-1 text-xs font-semibold text-accent-soft">
              <T k="portal.rewardDue" />
            </span>
          ) : (
            <span className="text-sm text-muted">{progress} / {required}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {stamps.map((filled, i) => (
            <span
              key={i}
              className={
                "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold " +
                (filled
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-line-2 text-muted")
              }
            >
              {filled ? "✓" : i + 1}
            </span>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          {rewardDue ? (
            <T k="portal.rewardHint" />
          ) : (
            <>
              <T k="portal.moreVisits.pre" /> {required - progress} <T k="portal.moreVisits.post" />
            </>
          )}
        </p>
      </div>

      {/* Kundeklubb – nivå */}
      {membership && (
        <div className="mb-6 border border-line bg-surface p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold"><T k="portal.membership" /></h2>
            <TierBadge name={membership.tierName} color={membership.color} />
          </div>
          {membership.benefit && (
            <p className="text-sm text-fg">
              <span className="text-muted"><T k="portal.benefit" /></span>
              {membership.benefit}
            </p>
          )}
          <p className="mt-3 text-xs text-muted">
            {nok(membership.spend)} <T k="portal.spent" /> · {membership.visits} <T k="portal.completedVisits" />
          </p>
          {membership.nextTierName && membershipLeft ? (
            <p className="mt-3 border-t border-line pt-3 text-sm text-fg">
              {membershipLeft.spendLeft > 0 ? nok(membershipLeft.spendLeft) : "0 kr"}
              {" "}<T k="portal.or" />{" "}
              {membershipLeft.visitsLeft > 0 ? membershipLeft.visitsLeft : 0} <T k="portal.visitsLeftTo" />{" "}
              <span className="font-semibold text-accent-soft">{membership.nextTierName}</span>.
            </p>
          ) : (
            <p className="mt-3 border-t border-line pt-3 text-sm font-semibold text-accent-soft">
              <T k="portal.topTier" />
            </p>
          )}
        </div>
      )}

      {/* Nøkkeltall */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="border border-line bg-surface p-4 text-center">
          <p className="font-display text-2xl font-bold text-fg">{p.visits}</p>
          <p className="text-xs text-muted"><T k="portal.completedVisits" /></p>
        </div>
        <div className="border border-line bg-surface p-4 text-center">
          <p className="font-display text-2xl font-bold text-fg">{nok(p.total_spent)}</p>
          <p className="text-xs text-muted"><T k="portal.spentWithUs" /></p>
        </div>
      </div>

      {/* Kommende timer – med selvbetjening (avbestill / endre tid) */}
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

      {/* Historikk */}
      <div className="mb-8 border border-line bg-surface">
        <h2 className="border-b border-line px-6 py-4 font-display text-lg font-bold"><T k="portal.history" /></h2>
        {history.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted"><T k="portal.noHistory" /></p>
        ) : (
          <ul className="divide-y divide-line">
            {history.slice(0, 30).map((b) => {
              const rebook = b.service
                ? `/booking?service=${encodeURIComponent(b.service)}${b.barber ? `&barber=${encodeURIComponent(b.barber)}` : ""}`
                : "/booking";
              return (
                <li key={b.id} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
                  <div className="min-w-0">
                    <span className="text-fg">
                      {b.service ? <TDyn text={b.service} map="services" /> : <T k="portal.appointment" />}
                    </span>
                    <span className="block text-xs text-muted">
                      <PortalDate iso={b.start_at} />
                      {b.barber ? ` · ${b.barber}` : ""}
                    </span>
                    {(addonsByBooking.get(b.id)?.length ?? 0) > 0 && (
                      <span className="block text-xs text-muted">
                        +{" "}
                        {addonsByBooking.get(b.id)!.map((a, i) => (
                          <span key={a}>
                            {i > 0 ? ", " : ""}
                            <TDyn text={a} map="services" />
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-muted">
                      {STATUS_KEYS.has(b.status) ? <T k={`portal.status.${b.status}`} /> : b.status}
                    </span>
                    <Link href={rebook} className="text-xs font-semibold text-accent-soft hover:underline">
                      <T k="portal.rebook" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <a
          href="/booking"
          className="inline-block bg-accent px-6 py-3 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
        >
          <T k="common.bookNew" />
        </a>
        {p.visits > 0 && (
          <a
            href={`/min-side/${token}/kjopshistorikk`}
            className="inline-flex items-center gap-1.5 border border-line-2 px-6 py-3 text-sm font-semibold text-fg transition-colors hover:bg-surface-2"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <T k="portal.downloadHistory" />
          </a>
        )}
      </div>
    </main>
  );
}
