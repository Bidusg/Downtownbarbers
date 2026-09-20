"use client";

import { useState, useTransition } from "react";
import type { CashSettlement, MethodBreakdown } from "@/lib/ops-queries";
import {
  createSettlement,
  deleteSettlement,
  expectedByMethod,
} from "@/app/admin/kasseoppgjor/actions";

const inputCls =
  "border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft";

const kr = (n: number) => n.toLocaleString("nb-NO") + " kr";
const signedKr = (n: number) =>
  (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toLocaleString("nb-NO") + " kr";

function no(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const METHODS: { key: keyof MethodBreakdown; label: string; field: string }[] = [
  { key: "cash", label: "Kontant", field: "counted_cash" },
  { key: "card", label: "Kort", field: "counted_card" },
  { key: "vipps", label: "Vipps", field: "counted_vipps" },
];

/** Avvik-celle: talt − forventet. 0 = stemmer, ellers uthevet. */
function Avvik({ diff }: { diff: number }) {
  if (diff === 0)
    return <span className="text-xs font-semibold text-accent-soft">✓ stemmer</span>;
  return (
    <span className="text-xs font-semibold text-danger" title="Talt minus forventet">
      {signedKr(diff)} {diff > 0 ? "(overskudd)" : "(manko)"}
    </span>
  );
}

function settlementExpectedTotal(s: CashSettlement): number | null {
  if (
    s.expected_cash == null &&
    s.expected_card == null &&
    s.expected_vipps == null
  )
    return null;
  return (
    Number(s.expected_cash ?? 0) +
    Number(s.expected_card ?? 0) +
    Number(s.expected_vipps ?? 0)
  );
}

export function SettlementManager({
  settlements,
  defaultDate,
}: {
  settlements: CashSettlement[];
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [date, setDate] = useState(defaultDate);
  const [expected, setExpected] = useState<MethodBreakdown>({
    cash: 0,
    card: 0,
    vipps: 0,
  });
  const [loadingExp, setLoadingExp] = useState(false);
  const [counted, setCounted] = useState<Record<string, string>>({
    counted_cash: "",
    counted_card: "",
    counted_vipps: "",
  });

  function loadExpected(d: string) {
    setLoadingExp(true);
    expectedByMethod(d).then((e) => {
      setExpected(e);
      setLoadingExp(false);
    });
  }
  function openForm() {
    setOpen(true);
    loadExpected(date);
  }

  const countedNum = (field: string) => {
    const n = Number(counted[field]);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  };
  const countedTotal =
    countedNum("counted_cash") +
    countedNum("counted_card") +
    countedNum("counted_vipps");
  const expectedTotal = expected.cash + expected.card + expected.vipps;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Dagsoppgjør</p>
        <button
          onClick={() => (open ? setOpen(false) : openForm())}
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {open ? "Lukk" : "+ Nytt oppgjør"}
        </button>
      </div>

      {open && (
        <form
          action={async (fd) => {
            await createSettlement(fd);
            setCounted({ counted_cash: "", counted_card: "", counted_vipps: "" });
            setOpen(false);
          }}
          className="space-y-4 border border-line bg-surface p-5"
        >
          <label className="block text-xs text-muted">
            Dato
            <input
              name="settle_date"
              type="date"
              required
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                loadExpected(e.target.value);
              }}
              className={`mt-1 block w-full max-w-[12rem] ${inputCls}`}
            />
          </label>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="py-2 pr-3">Betalingsmåte</th>
                  <th className="py-2 pr-3 text-right">Forventet</th>
                  <th className="py-2 pr-3 text-right">Talt</th>
                  <th className="py-2 text-right">Avvik</th>
                </tr>
              </thead>
              <tbody>
                {METHODS.map((m) => {
                  const exp = expected[m.key];
                  const cnt = countedNum(m.field);
                  return (
                    <tr key={m.key} className="border-t border-line">
                      <td className="py-2 pr-3 font-medium text-fg">{m.label}</td>
                      <td className="py-2 pr-3 text-right text-muted">
                        {loadingExp ? "…" : kr(exp)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <input
                          name={m.field}
                          type="number"
                          min={0}
                          step="1"
                          inputMode="numeric"
                          placeholder="0"
                          value={counted[m.field]}
                          onChange={(e) =>
                            setCounted((c) => ({ ...c, [m.field]: e.target.value }))
                          }
                          className={`w-28 text-right ${inputCls}`}
                        />
                      </td>
                      <td className="py-2 text-right">
                        <Avvik diff={cnt - exp} />
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-line-2">
                  <td className="py-2 pr-3 font-semibold text-fg">Sum</td>
                  <td className="py-2 pr-3 text-right font-semibold text-muted">
                    {loadingExp ? "…" : kr(expectedTotal)}
                  </td>
                  <td className="py-2 pr-3 text-right font-semibold text-fg">
                    {kr(countedTotal)}
                  </td>
                  <td className="py-2 text-right">
                    <Avvik diff={countedTotal - expectedTotal} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <input
            name="note"
            placeholder="Notat (valgfritt) – f.eks. forklaring på avvik"
            className={`block w-full ${inputCls}`}
          />
          <button
            type="submit"
            disabled={pending}
            className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
          >
            Lagre oppgjør
          </button>
        </form>
      )}

      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Dato</th>
              <th className="px-4 py-3 text-right">Talt</th>
              <th className="px-4 py-3 text-right">Forventet</th>
              <th className="px-4 py-3 text-right">Avvik</th>
              <th className="px-4 py-3">Notat</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {settlements.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Ingen oppgjør registrert enda.
                </td>
              </tr>
            )}
            {settlements.map((s) => {
              const expTotal = settlementExpectedTotal(s);
              return (
                <tr key={s.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium text-fg">
                    {no(s.settle_date)}
                  </td>
                  <td className="px-4 py-3 text-right font-display text-accent-soft">
                    {kr(s.total_nok)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted">
                    {expTotal == null ? "—" : kr(expTotal)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {expTotal == null ? (
                      <span className="text-xs text-muted">uten avstemming</span>
                    ) : (
                      <Avvik diff={s.total_nok - expTotal} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{s.note ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        if (confirm("Slette dette oppgjøret?"))
                          start(() => deleteSettlement(s.id));
                      }}
                      disabled={pending}
                      className="text-xs text-danger hover:underline"
                    >
                      Slett
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
