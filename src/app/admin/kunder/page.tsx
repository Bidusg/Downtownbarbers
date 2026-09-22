import { getCustomersPage } from "@/lib/admin-queries";
import { CustomerTable } from "@/components/admin/CustomerTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { createCustomer } from "./actions";

const inputCls =
  "border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft";

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
      <PageHeader
        title="Kundekartotek"
        actions={<span className="text-sm text-muted">{total} kunder</span>}
      />

      <details className="mb-6 border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-accent-soft">
          + Ny kunde
        </summary>
        <form action={createCustomer} className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
          <input name="full_name" placeholder="Fullt navn" required className={inputCls} />
          <input name="phone" type="tel" placeholder="Telefon" className={inputCls} />
          <input name="email" type="email" placeholder="E-post" className={inputCls} />
          <input name="category" placeholder="Kategori (valgfritt)" className={inputCls} />
          <input name="notes" placeholder="Notat (valgfritt)" className={`${inputCls} sm:col-span-2`} />
          <Button type="submit" className="px-4 py-2 text-sm sm:col-span-2">
            Opprett kunde
          </Button>
        </form>
      </details>

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
