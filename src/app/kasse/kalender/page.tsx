import { requireRole } from "@/lib/auth";
import { getDayAgenda, getBarbers, getServices } from "@/lib/shop-queries";
import { getShopContext } from "@/lib/shop-settings";
import { DayCalendar } from "@/components/kasse/DayCalendar";

export const dynamic = "force-dynamic";

function osloToday() {
  // yyyy-mm-dd i Oslo-tid
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Oslo",
  });
}

export default async function KalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireRole(["shop", "admin"]);
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : osloToday();

  const [rawAgenda, barbers, services, shop] = await Promise.all([
    getDayAgenda(date),
    getBarbers(),
    getServices(),
    getShopContext(),
  ]);
  // Shop ser ikke telefonnummer – fjernes server-side (kun admin ser alt).
  const agenda = rawAgenda.map((b) => ({ ...b, phone: null }));
  // Dra-for-lengde styres av shop-flagg (eier/admin omgår).
  const canResize = shop.canBypass || shop.flags.drag_for_length_enabled;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="mb-4 font-display text-xl font-bold">Dagskalender</h1>
      <DayCalendar
        date={date}
        agenda={agenda}
        barbers={barbers}
        services={services}
        canResize={canResize}
      />
    </main>
  );
}
