import { getDayAgenda, getBarbers, getServices } from "@/lib/shop-queries";
import { DayCalendar } from "@/components/kasse/DayCalendar";

export const dynamic = "force-dynamic";

function osloToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
}

export default async function AdminBookinger({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const date =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : osloToday();

  const [agenda, barbers, services] = await Promise.all([
    getDayAgenda(date),
    getBarbers(),
    getServices(),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-bold">Bookinger</h1>
        <span className="text-sm text-muted">
          Dagskalender · book, flytt, blokker
        </span>
      </div>
      <DayCalendar
        date={date}
        agenda={agenda}
        barbers={barbers}
        services={services}
        basePath="/admin/bookinger"
        canBlock
      />
    </div>
  );
}
