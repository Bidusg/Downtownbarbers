import Link from "next/link";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { requireRole } from "@/lib/auth";
import { getShopToday, getTodayBookings } from "@/lib/dashboard-queries";
import { getUpcomingBookings } from "@/lib/admin-queries";
import { getBarbers, getServices } from "@/lib/shop-queries";
import { ShopBookingList } from "@/components/kasse/ShopBookingList";
import { DeskBooking } from "@/components/kasse/DeskBooking";

function dayLabel(iso: string) {
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
function timeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("nb-NO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default async function KasseDashboard() {
  await requireRole(["shop", "admin"]);
  const [today, todayBookings, upcoming, barbers, services] = await Promise.all([
    getShopToday(),
    getTodayBookings(),
    getUpcomingBookings(),
    getBarbers(),
    getServices(),
  ]);
  // Kommende (etter i dag), gruppert per dag – uten kroner (shop ser aldri omsetning)
  const startTomorrow = new Date();
  startTomorrow.setHours(0, 0, 0, 0);
  startTomorrow.setDate(startTomorrow.getDate() + 1);
  const future = upcoming.filter((b) => new Date(b.start_at) >= startTomorrow);
  const byDay = new Map<string, typeof future>();
  for (const b of future) {
    const k = dayLabel(b.start_at);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(b);
  }
  const pct = today.customersTarget
    ? Math.round((today.customersServed / today.customersTarget) * 100)
    : 0;
  const remaining = Math.max(0, today.customersTarget - today.customersServed);

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
            Downtown Barbers
          </p>
          <p className="font-display text-lg font-bold">Kasse</p>
        </div>
        <div className="flex items-center gap-2">
          {!today.live && (
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-muted uppercase">
              Demo
            </span>
          )}
          <span className="rounded-full bg-accent-soft/15 px-3 py-1 text-xs font-semibold text-accent-soft">
            Shop
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <DeskBooking
            services={services}
            barbers={barbers}
            label="+ Ny booking"
          />
          <Link
            href="/kasse/kalender"
            className="border border-line px-4 py-2 text-sm font-semibold text-fg hover:border-accent-soft"
          >
            Dagskalender →
          </Link>
          <Link
            href="/kasse/kunder"
            className="border border-line px-4 py-2 text-sm font-semibold text-fg hover:border-accent-soft"
          >
            Kunder →
          </Link>
        </div>

        <Link
          href="/kasse/stempling"
          className="flex items-center justify-between border border-line bg-accent px-6 py-4 text-accent-fg transition-opacity hover:opacity-90"
        >
          <span className="font-display text-lg font-bold">Stemplingsur — vakt / pause</span>
          <span className="text-sm opacity-80">Åpne →</span>
        </Link>

        <section className="border border-line bg-surface p-8">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
            Dagens fremdrift
          </p>
          <div className="mt-4 mb-3 flex items-end justify-between">
            <span className="font-display text-6xl font-bold text-fg">{pct} %</span>
            <span className="pb-2 text-lg text-muted">
              {today.customersServed} av {today.customersTarget} kunder
            </span>
          </div>
          <ProgressBar value={pct} />
          <p className="mt-4 text-sm text-muted">
            {remaining > 0
              ? `Bra jobba – ${remaining} kunder igjen til dagens mål.`
              : "Dagens mål er nådd – sterkt jobba! 💈"}
          </p>
        </section>

        <section className="border border-line bg-surface p-6">
          <h2 className="mb-4 font-display text-lg font-bold">Dagens timer</h2>
          {today.live ? (
            <ShopBookingList
              bookings={todayBookings}
              services={services}
              barbers={barbers}
            />
          ) : (
            // Demo-modus: vis planlagte tider uten handlingsknapper
            <ul className="divide-y divide-line">
              {today.nextUp.map((b, i) => (
                <li key={i} className="flex items-center gap-4 py-3">
                  <span className="font-display text-sm font-bold text-accent-soft">
                    {b.time}
                  </span>
                  <span className="flex-1 text-sm text-fg">{b.customer}</span>
                  <span className="text-sm text-muted">{b.service}</span>
                  <span className="text-xs text-muted">{b.barber}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border border-line bg-surface p-6">
          <h2 className="mb-4 font-display text-lg font-bold">Kommende bookinger</h2>
          {future.length === 0 ? (
            <p className="text-sm text-muted">Ingen kommende bookinger enda.</p>
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
                          {timeLabel(b.start_at)}
                        </span>
                        <span className="flex-1 text-sm text-fg">{b.customer}</span>
                        <span className="text-sm text-muted">{b.service}</span>
                        <span className="text-xs text-muted">{b.barber}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="text-center text-xs text-muted">
          Shop-kontoen ser aldri omsetning, budsjett eller lønnsomhet.
        </p>
      </main>
    </div>
  );
}
