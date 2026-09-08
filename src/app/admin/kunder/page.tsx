import { getCustomersPage } from "@/lib/admin-queries";
import { CustomerTable } from "@/components/admin/CustomerTable";

export default async function AdminKunder({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = Number(sp.page) || 1;
  const { rows, total, pageSize } = await getCustomersPage({ q, page });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-bold">Kundekartotek</h1>
        <span className="text-sm text-muted">{total} kunder</span>
      </div>
      <CustomerTable
        customers={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        q={q}
      />
    </div>
  );
}
