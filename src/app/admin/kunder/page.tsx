import Link from "next/link";
import { getCustomersPage } from "@/lib/admin-queries";
import { CustomerTable } from "@/components/admin/CustomerTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubmitButton } from "@/components/ui/SubmitButton";
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
        actions={
          <div className="flex items-center gap-4">
            <Link
              href="/admin/kunder/filter"
              className="text-sm font-semibold text-accent-soft hover:underline"
            >
              Filtrer kunder →
            </Link>
            <span className="text-sm text-muted">{total} kunder</span>
          </div>
        }
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
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Oppretter …" className="act act-accent">
              Opprett kunde
            </SubmitButton>
          </div>
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
