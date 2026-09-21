"use client";

import { Fragment, useState, useTransition } from "react";
import type { StaffLevel, PriceService } from "@/lib/levels-queries";
import { saveLevelPrices } from "@/app/admin/nivaer/actions";

export function LevelPricingMatrix({
  levels,
  services,
  prices,
}: {
  levels: StaffLevel[];
  services: PriceService[];
  /** service_id → level_id → pris */
  prices: Record<string, Record<string, number>>;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();

  // Grupper tjenester etter kategori for lesbarhet.
  const groups: { cat: string; rows: PriceService[] }[] = [];
  for (const s of services) {
    let g = groups.find((x) => x.cat === s.categoryName);
    if (!g) {
      g = { cat: s.categoryName, rows: [] };
      groups.push(g);
    }
    g.rows.push(s);
  }

  return (
    <form
      action={(fd) =>
        start(async () => {
          setMsg(null);
          setErr(false);
          const r = await saveLevelPrices(fd);
          if (r.error) {
            setErr(true);
            setMsg(r.error);
          } else {
            setMsg("Lagret ✓");
          }
        })
      }
      className="space-y-4"
    >
      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Tjeneste</th>
              <th className="px-4 py-3 text-right">Basispris</th>
              {levels.map((l) => (
                <th key={l.id} className="px-4 py-3 text-right">
                  {l.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {services.length === 0 && (
              <tr>
                <td
                  colSpan={2 + levels.length}
                  className="px-4 py-8 text-center text-muted"
                >
                  Ingen aktive tjenester.
                </td>
              </tr>
            )}
            {groups.map((g) => (
              <Fragment key={g.cat}>
                <tr className="border-t border-line bg-surface/60">
                  <td
                    colSpan={2 + levels.length}
                    className="px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase"
                  >
                    {g.cat}
                  </td>
                </tr>
                {g.rows.map((s) => (
                  <tr key={s.id} className="border-t border-line">
                    <td className="px-4 py-2 font-medium text-fg">{s.name}</td>
                    <td className="px-4 py-2 text-right text-muted">
                      {s.base_price_nok} kr
                    </td>
                    {levels.map((l) => (
                      <td key={l.id} className="px-4 py-2 text-right">
                        <input
                          name={`price_${s.id}__${l.id}`}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          defaultValue={prices[s.id]?.[l.id] ?? ""}
                          placeholder={String(s.base_price_nok)}
                          className="w-24 border border-line-2 bg-canvas px-2 py-1 text-right text-sm outline-none focus:border-accent-soft"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-5 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-40"
        >
          {pending ? "Lagrer …" : "Lagre priser"}
        </button>
        {msg && (
          <span className={"text-sm " + (err ? "text-danger" : "text-muted")}>
            {msg}
          </span>
        )}
        <span className="text-xs text-muted">
          Tom celle = basispris. Tall = fast pris for det nivået.
        </span>
      </div>
    </form>
  );
}
