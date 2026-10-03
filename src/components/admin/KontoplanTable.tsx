"use client";

import { useMemo, useState } from "react";

export type KontoplanAccount = {
  tripletex_id: number;
  number: string | null;
  name: string | null;
  type: string | null;
  ledger_type: string | null;
};

export function KontoplanTable({
  accounts,
  movementNumbers,
}: {
  accounts: KontoplanAccount[];
  movementNumbers: string[];
}) {
  const [showAll, setShowAll] = useState<boolean>(false);

  const movementSet = useMemo(() => new Set(movementNumbers), [movementNumbers]);

  const sortedAccounts = useMemo(() => {
    const byNumber = (a: KontoplanAccount, b: KontoplanAccount) => {
      const na = Number.parseInt(a.number ?? "", 10);
      const nb = Number.parseInt(b.number ?? "", 10);
      const aValid = Number.isFinite(na);
      const bValid = Number.isFinite(nb);
      if (aValid && bValid) return na - nb;
      if (aValid) return -1;
      if (bValid) return 1;
      return 0;
    };
    return [...accounts].sort(byNumber);
  }, [accounts]);

  const movementAccounts = useMemo(
    () => sortedAccounts.filter((k) => k.number !== null && movementSet.has(k.number)),
    [sortedAccounts, movementSet]
  );

  const visibleAccounts = showAll ? sortedAccounts : movementAccounts;

  const emptyMessage =
    accounts.length === 0
      ? "Ingen kontoer synket."
      : "Ingen kontoer med bevegelse i perioden.";

  return (
    <div className="border border-line bg-surface">
      <div className="border-b border-line px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold">Kontoplan</h3>
            <p className="text-xs text-muted">
              Synket fra Tripletex. Viser {visibleAccounts.length} av {accounts.length} kontoer.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="inline-flex items-center gap-1.5 border border-line-2 px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-surface-2"
          >
            {showAll
              ? "Vis kun kontoer med bevegelse"
              : `Vis hele kontoplanen (${accounts.length})`}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-6 py-3 font-medium">Konto</th>
              <th className="px-6 py-3 font-medium">Navn</th>
              <th className="px-6 py-3 font-medium">Type</th>
              <th className="px-6 py-3 font-medium">Hovedbok</th>
            </tr>
          </thead>
          <tbody>
            {visibleAccounts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visibleAccounts.map((k) => (
                <tr key={k.tripletex_id} className="border-b border-line last:border-0">
                  <td className="px-6 py-3 tabular-nums text-fg-soft">{k.number ?? "—"}</td>
                  <td className="px-6 py-3">{k.name ?? "—"}</td>
                  <td className="px-6 py-3 text-muted">{k.type ?? "—"}</td>
                  <td className="px-6 py-3 text-muted">{k.ledger_type ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
