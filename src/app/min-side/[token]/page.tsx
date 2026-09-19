import { createClient } from "@/lib/supabase/server";
import { getCustomerMembershipByToken, remainingToNext } from "@/lib/membership-queries";
import { TierBadge } from "@/components/membership/TierBadge";

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

const STATUS: Record<string, string> = {
  pending: "Venter", confirmed: "Bekreftet", completed: "Fullført",
  cancelled: "Avbestilt", no_show: "Ikke møtt",
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("nb-NO", {
      weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}
const nok = (n: number) => Math.round(n).toLocaleString("nb-NO") + " kr";

function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-5 py-16">
      <div className="w-full border border-line bg-surface p-8 text-center">
        <h1 className="font-display text-2xl font-bold text-fg">Fant ikke siden</h1>
        <p className="mt-3 text-sm text-muted">Lenken ser ut til å være ugyldig eller utløpt.</p>
        <a href="/" className="mt-6 inline-block text-sm text-accent-soft hover:underline">Til forsiden</a>
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
          Hei {p.full_name.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-muted">Din side · medlem siden {fmtDate(p.member_since)}</p>
      </div>

      {/* Klippekort */}
      <div className="mb-6 border border-line bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Klippekort</h2>
          {rewardDue ? (
            <span className="bg-accent-soft/15 px-3 py-1 text-xs font-semibold text-accent-soft">
              Gratis klipp klart! 🎉
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
          {rewardDue
            ? "Si ifra i kassen ved neste besøk, så trekker vi fra det gratis klippet."
            : `Kom ${required - progress} gang(er) til, så er neste klipp gratis.`}
        </p>
      </div>

      {/* Kundeklubb – nivå */}
      {membership && (
        <div className="mb-6 border border-line bg-surface p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Din medlemsstatus</h2>
            <TierBadge name={membership.tierName} color={membership.color} />
          </div>
          {membership.benefit && (
            <p className="text-sm text-fg">
              <span className="text-muted">Ditt medlemsgode: </span>
              {membership.benefit}
            </p>
          )}
          <p className="mt-3 text-xs text-muted">
            {nok(membership.spend)} brukt · {membership.visits} fullførte besøk
          </p>
          {membership.nextTierName && membershipLeft ? (
            <p className="mt-3 border-t border-line pt-3 text-sm text-fg">
              {membershipLeft.spendLeft > 0 ? nok(membershipLeft.spendLeft) : "0 kr"}
              {" eller "}
              {membershipLeft.visitsLeft > 0 ? membershipLeft.visitsLeft : 0} besøk igjen til{" "}
              <span className="font-semibold text-accent-soft">{membership.nextTierName}</span>.
            </p>
          ) : (
            <p className="mt-3 border-t border-line pt-3 text-sm font-semibold text-accent-soft">
              Du er på vårt høyeste nivå 🏆
            </p>
          )}
        </div>
      )}

      {/* Nøkkeltall */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="border border-line bg-surface p-4 text-center">
          <p className="font-display text-2xl font-bold text-fg">{p.visits}</p>
          <p className="text-xs text-muted">fullførte besøk</p>
        </div>
        <div className="border border-line bg-surface p-4 text-center">
          <p className="font-display text-2xl font-bold text-fg">{nok(p.total_spent)}</p>
          <p className="text-xs text-muted">brukt hos oss</p>
        </div>
      </div>

      {/* Kommende timer */}
      {upcoming.length > 0 && (
        <div className="mb-6 border border-line bg-surface">
          <h2 className="border-b border-line px-6 py-4 font-display text-lg font-bold">Kommende timer</h2>
          <ul className="divide-y divide-line">
            {upcoming.map((b) => (
              <li key={b.id} className="px-6 py-4">
                <p className="font-medium text-fg">{b.service ?? "Time"}</p>
                <p className="text-sm text-muted capitalize">
                  {fmt(b.start_at)}{b.barber ? ` · hos ${b.barber}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Historikk */}
      <div className="mb-8 border border-line bg-surface">
        <h2 className="border-b border-line px-6 py-4 font-display text-lg font-bold">Historikk</h2>
        {history.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted">Ingen tidligere timer enda.</p>
        ) : (
          <ul className="divide-y divide-line">
            {history.slice(0, 30).map((b) => {
              const rebook = b.service
                ? `/booking?service=${encodeURIComponent(b.service)}${b.barber ? `&barber=${encodeURIComponent(b.barber)}` : ""}`
                : "/booking";
              return (
                <li key={b.id} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
                  <div className="min-w-0">
                    <span className="text-fg">{b.service ?? "Time"}</span>
                    <span className="block text-xs text-muted">{fmtDate(b.start_at)}{b.barber ? ` · ${b.barber}` : ""}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-muted">{STATUS[b.status] ?? b.status}</span>
                    <a href={rebook} className="text-xs font-semibold text-accent-soft hover:underline">
                      Book på nytt
                    </a>
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
          Bestill ny time
        </a>
        {p.visits > 0 && (
          <a
            href={`/min-side/${token}/kjopshistorikk`}
            className="inline-flex items-center gap-1.5 border border-line-2 px-6 py-3 text-sm font-semibold text-fg transition-colors hover:bg-surface-2"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Last ned kjøpshistorikk (PDF)
          </a>
        )}
      </div>
    </main>
  );
}
