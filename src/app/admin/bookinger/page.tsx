import { getUpcomingBookings } from "@/lib/admin-queries";
import { BookingManager } from "@/components/admin/BookingManager";

export default async function AdminBookinger() {
  const bookings = await getUpcomingBookings();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 font-display text-2xl font-bold">Bookinger</h1>
      <BookingManager bookings={bookings} />
    </div>
  );
}
