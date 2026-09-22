"use client";

import { useState } from "react";
import type { Voucher } from "@/lib/vouchers-queries";
import { voucherSignedUrl } from "@/app/admin/bilag/actions";

const KIND_LABELS: Record<Voucher["kind"], string> = {
  faktura: "Faktura",
  kvittering: "Kvittering",
  bilag: "Bilag",
  annet: "Annet",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("nb-NO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return `${n.toLocaleString("nb-NO")} kr`;
}

/**
 * Lese-kun liste over bilag for revisor. Nedlasting går via en signert URL
 * fra en server action (voucherSignedUrl) – bøtta er privat, og revisor har
 * ingen skrivetilgang.
 */
export function VoucherList({ vouchers }: { vouchers: Voucher[] }) {
  const [error, setError] = useState<string | null>(null);

  async function onDownload(id: string) {
    setError(null);
    const url = await voucherSignedUrl(id);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      setError("Kunne ikke lage nedlastingslenke. Prøv igjen.");
    }
  }

  if (vouchers.length === 0) {
    return (
      <div className="border border-line bg-surface">
        <p className="px-6 py-8 text-sm text-muted">Ingen bilag enda.</p>
      </div>
    );
  }

  return (
    <div className="border border-line bg-surface">
      {error && (
        <div className="border-b border-danger/30 bg-danger/5 px-6 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-6 py-3 font-medium">Dato</th>
              <th className="px-4 py-3 font-medium">Tittel</th>
              <th className="px-4 py-3 font-medium">Leverandør</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 text-right font-medium">Beløp</th>
              <th className="px-4 py-3 text-right font-medium">Mva</th>
              <th className="px-4 py-3 text-right font-medium">Handling</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v.id} className="border-b border-line last:border-0">
                <td className="px-6 py-3 whitespace-nowrap text-muted">
                  {fmtDate(v.voucherDate)}
                </td>
                <td className="px-4 py-3 text-fg">{v.title}</td>
                <td className="px-4 py-3 text-muted">{v.supplier || "—"}</td>
                <td className="px-4 py-3 text-muted">
                  <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                    {KIND_LABELS[v.kind]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted">
                  {fmtMoney(v.amountNok)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted">
                  {fmtMoney(v.vatNok)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => onDownload(v.id)}
                      className="border border-line-2 bg-surface-2 px-3 py-1 text-xs text-fg transition-opacity hover:opacity-90"
                    >
                      Last ned
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
