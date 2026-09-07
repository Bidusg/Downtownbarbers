import { BudgetManager } from "@/components/admin/BudgetManager";
import { getBudgets, getStaffOptions } from "@/lib/ops-queries";

export default async function AdminBudsjett({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const now = new Date();
  const sp = await searchParams;
  const year = Number(sp.year) || now.getFullYear();
  const month = Number(sp.month) || now.getMonth() + 1;

  const [budgets, staff] = await Promise.all([
    getBudgets(year, month),
    getStaffOptions(),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 font-display text-2xl font-bold">Budsjett</h1>
      <p className="mb-6 text-sm text-muted">
        Omsetningsmål per barber per måned. Brukes som grunnlag for
        måloppnåelse i regnskapet.
      </p>
      <BudgetManager
        budgets={budgets}
        staff={staff}
        year={year}
        month={month}
      />
    </div>
  );
}
