import { getCustomers } from "@/lib/admin-queries";
import { CustomerTable } from "@/components/admin/CustomerTable";

export default async function AdminKunder() {
  const customers = await getCustomers();
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-bold">Kundekartotek</h1>
        <span className="text-sm text-muted">{customers.length} kunder</span>
      </div>
      <CustomerTable customers={customers} />
    </div>
  );
}
