import { getCancelledBookings } from "@/lib/cancelled-queries";
import { CancelledList } from "@/components/admin/CancelledList";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function AdminAvbestillinger() {
  const cancelled = await getCancelledBookings();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Avbestillinger"
        description="Alle avbestilte timer siden lansering – både kundens egne avbestillinger og de dere gjør i skranken."
      />
      <CancelledList items={cancelled} />
    </div>
  );
}
