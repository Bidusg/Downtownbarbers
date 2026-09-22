"use client";

import { useRef, useState, useTransition } from "react";
import type { Voucher } from "@/lib/vouchers-queries";
import { uploadVoucher, deleteVoucher, voucherSignedUrl } from "@/app/admin/bilag/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";

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

export function VoucherManager({ vouchers }: { vouchers: Voucher[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function onUpload(formData: FormData) {
    setError(null);
    setOk(false);
    start(async () => {
      const res = await uploadVoucher(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setOk(true);
        formRef.current?.reset();
      }
    });
  }

  async function onDownload(id: string) {
    const url = await voucherSignedUrl(id);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      setError("Kunne ikke lage nedlastingslenke. Prøv igjen.");
    }
  }

  return (
    <div className="space-y-8">
      {/* Last opp */}
      <form
        ref={formRef}
        action={onUpload}
        className="space-y-4 border border-line bg-surface p-6"
      >
        <h2 className="font-display text-lg font-bold">Last opp bilag</h2>

        {ok && (
          <div className="flex items-start gap-3 border border-accent-soft/30 bg-accent-soft/5 px-4 py-3 text-sm">
            <span className="mt-0.5 text-accent-soft">●</span>
            <p className="text-muted">
              <strong className="text-fg">Bilaget ble lastet opp</strong> og er
              nå tilgjengelig for revisor.
            </p>
          </div>
        )}
        {error && (
          <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs text-muted">Fil</label>
          <input
            type="file"
            name="file"
            required
            className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg file:mr-3 file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-fg"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted">
              Tittel{" "}
              <span className="text-muted/70">(valgfritt — bruker filnavn)</span>
            </label>
            <input
              name="title"
              placeholder="F.eks. Faktura – rekvisita mars"
              className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Leverandør</label>
            <input
              name="supplier"
              placeholder="F.eks. Rekvisita AS"
              className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Type</label>
            <select
              name="kind"
              defaultValue="bilag"
              className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
            >
              <option value="faktura">Faktura</option>
              <option value="kvittering">Kvittering</option>
              <option value="bilag">Bilag</option>
              <option value="annet">Annet</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Bilagsdato</label>
            <input
              type="date"
              name="voucher_date"
              className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              Beløp (kr){" "}
              <span className="text-muted/70">(inkl. mva)</span>
            </label>
            <input
              name="amount_nok"
              inputMode="decimal"
              placeholder="F.eks. 1234,50"
              className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Herav mva (kr)</label>
            <input
              name="vat_nok"
              inputMode="decimal"
              placeholder="F.eks. 246,90"
              className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Laster opp …" : "Last opp"}
          </button>
          <span className="text-xs text-muted">
            Filen lagres i privat arkiv og deles automatisk med revisor.
          </span>
        </div>
      </form>

      {/* Liste */}
      <div className="border border-line bg-surface">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Bilag</h2>
        </div>

        {vouchers.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">Ingen bilag enda.</p>
        ) : (
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
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => onDownload(v.id)}
                          className="border border-line-2 bg-surface-2 px-3 py-1 text-xs text-fg transition-opacity hover:opacity-90"
                        >
                          Last ned
                        </button>
                        <ConfirmButton
                          label="Slett"
                          confirmLabel="Ja, slett"
                          onConfirm={() => deleteVoucher(v.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
