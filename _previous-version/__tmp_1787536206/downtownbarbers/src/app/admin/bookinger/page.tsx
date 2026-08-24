import { getUpcomingBookings } from "@/lib/admin-queries";

const statusStyle: Record<string, string> = {
  confirmed: "bg-accent-soft/15 text-accent-soft",
  completed: "bg-surface-2 text-muted",
  cancelled: "bg-surface-2 text-danger",
  pending: "bg-surface-2 text-muted",
  no_show: "bg-surface-2 text-danger",
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("nb-NO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default async function AdminBookinger() {
  const bookings = await getUpcomingBookings();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 font-display text-2xl font-bold">Bookinger</h1>
      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Tidspunkt</th>
              <th className="px-4 py-3">Kunde</th>
              <th className="px-4 py-3">Tjeneste</th>
              <th className="px-4 py-3">Barber</th>
              <th className="px-4 py-3">Pris</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Ingen bookinger enda. De dukker opp her når kunder bestiller time.
                </td>
              </tr>
            )}
            {bookings.map((b) => (
              <tr key={b.id} className="border-t border-line">
                <td className="px-4 py-3 text-fg">{fmt(b.start_at)}</td>
                <td className="px-4 py-3">{b.customer}</td>
                <td className="px-4 py-3 text-muted">{b.service}</td>
                <td className="px-4 py-3 text-muted">{b.barber}</td>
                <td className="px-4 py-3 font-display">{b.price_nok} kr</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                      (statusStyle[b.status] ?? "bg-surface-2 text-muted")
                    }
                  >
                    {b.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
