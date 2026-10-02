import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  getTripletexSaldobalanse,
  getTripletexVouchers,
  getLastSync,
} from "@/lib/tripletex/queries";

export const dynamic = "force-dynamic";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";
/** Beløp eller «—» for null. */
const kr = (n: number | null) => (n == null ? "—" : nok(n));

/** Formater siste synk-tidspunkt til «Sist synket: …» (Oslo-tid), ellers null. */
function formatLastSync(
  ls: { finished_at: string | null; status: string | null } | null,
): string | null {
  if (!ls?.finished_at) return null;
  const d = new Date(ls.finished_at);
  if (Number.isNaN(d.getTime())) return null;
  const s = d.toLocaleString("nb-NO", {
    timeZone: "Europe/Oslo",
    dateStyle: "short",
    timeStyle: "short",
  });
  return `Sist synket: ${s}`;
}

export default async function RevisorSaldobalanse() {
  await requireRole(["revisor", "admin"]);

  const year = String(new Date().getFullYear());
  const [rows, vouchers, lastSyncRaw] = await Promise.all([
    getTripletexSaldobalanse(year),
    getTripletexVouchers({ limit: 100 }),
    getLastSync(),
  ]);
  const lastSync = formatLastSync(lastSyncRaw);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Saldobalanse"
        description={`Saldobalanse og bilag synket fra Tripletex (hittil i år, ${year}).`}
      />

      {lastSync && <p className="-mt-4 text-xs text-muted">{lastSync}</p>}

      {/* Saldobalanse */}
      <div className="border border-line bg-surface">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Saldobalanse</h2>
          <p className="text-xs text-muted">Inngående, endring og utgående saldo per konto.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-6 py-3 font-medium">Konto</th>
                <th className="px-6 py-3 font-medium">Navn</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 text-right font-medium">Inngående</th>
                <th className="px-6 py-3 text-right font-medium">Endring</th>
                <th className="px-6 py-3 text-right font-medium">Utgående</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted">
                    Ingen saldobalanse synket ennå.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.account_number} className="border-b border-line last:border-0">
                    <td className="px-6 py-3 tabular-nums text-fg-soft">{r.account_number}</td>
                    <td className="px-6 py-3">{r.account_name ?? "—"}</td>
                    <td className="px-6 py-3 text-muted">{r.account_type ?? "—"}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{kr(r.balance_in)}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{kr(r.balance_change)}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{kr(r.balance_out)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bilag */}
      <div className="border border-line bg-surface">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Bilag</h2>
          <p className="text-xs text-muted">Siste 100 bilag fra Tripletex (nyeste først).</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-6 py-3 font-medium">Nr.</th>
                <th className="px-6 py-3 font-medium">Dato</th>
                <th className="px-6 py-3 font-medium">Beskrivelse</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted">
                    Ingen bilag synket ennå.
                  </td>
                </tr>
              ) : (
                vouchers.map((v) => (
                  <tr key={v.tripletex_id} className="border-b border-line last:border-0">
                    <td className="px-6 py-3 tabular-nums text-fg-soft">
                      {v.number ?? v.temp_number ?? "—"}
                    </td>
                    <td className="px-6 py-3 tabular-nums text-muted">{v.voucher_date ?? "—"}</td>
                    <td className="px-6 py-3">{v.description ?? "—"}</td>
                    <td className="px-6 py-3 text-muted">{v.voucher_type ?? "—"}</td>
                    <td className="px-6 py-3">
                      <span
                        className={
                          "rounded px-2 py-0.5 text-[11px] font-semibold " +
                          (v.booked
                            ? "bg-accent-soft/15 text-accent-soft"
                            : "bg-surface-2 text-muted")
                        }
                      >
                        {v.booked ? "Bokført" : "Utkast"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
