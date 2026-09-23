"use client";

import { useMemo, useState, useTransition } from "react";
import { STAFF_LEVELS, LEVEL_LABEL, type StaffLevel } from "@/lib/levels";
import { saveServiceLevelPrices } from "@/app/admin/priser/actions";

export type MatrixService = {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  baseDuration: number;
  levels: Record<StaffLevel, { price: string; duration: string }>;
};

type Cells = Record<StaffLevel, { price: string; duration: string }>;

const inputCls =
  "w-full border border-line-2 bg-canvas px-2 py-1.5 text-sm text-fg outline-none focus:border-accent-soft";

function ServiceRow({ svc }: { svc: MatrixService }) {
  const [cells, setCells] = useState<Cells>(() =>
    STAFF_LEVELS.reduce((acc, l) => {
      acc[l] = { ...svc.levels[l] };
      return acc;
    }, {} as Cells),
  );
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty = useMemo(
    () =>
      STAFF_LEVELS.some(
        (l) =>
          cells[l].price !== svc.levels[l].price ||
          cells[l].duration !== svc.levels[l].duration,
      ),
    [cells, svc.levels],
  );

  function set(level: StaffLevel, key: "price" | "duration", value: string) {
    setSaved(false);
    setErr(null);
    setCells((c) => ({ ...c, [level]: { ...c[level], [key]: value } }));
  }

  function save() {
    setErr(null);
    start(async () => {
      const r = await saveServiceLevelPrices(
        svc.id,
        STAFF_LEVELS.map((l) => ({
          level: l,
          price: cells[l].price,
          duration: cells[l].duration,
        })),
      );
      if (r.error) setErr(r.error);
      else {
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      }
    });
  }

  return (
    <tr className="border-t border-line align-top">
      <td className="px-4 py-3">
        <div className="font-medium text-fg">{svc.name}</div>
        <div className="text-xs text-muted">
          Grunn: {svc.basePrice} kr · {svc.baseDuration} min
        </div>
      </td>
      {STAFF_LEVELS.map((l) => (
        <td key={l} className="px-2 py-3">
          <div className="flex flex-col gap-1">
            <input
              value={cells[l].price}
              onChange={(e) => set(l, "price", e.target.value)}
              inputMode="numeric"
              placeholder={`${svc.basePrice} kr`}
              aria-label={`${svc.name} – ${LEVEL_LABEL[l]} pris`}
              className={inputCls}
            />
            <input
              value={cells[l].duration}
              onChange={(e) => set(l, "duration", e.target.value)}
              inputMode="numeric"
              placeholder={`${svc.baseDuration} min`}
              aria-label={`${svc.name} – ${LEVEL_LABEL[l]} varighet`}
              className={inputCls + " text-xs"}
            />
          </div>
        </td>
      ))}
      <td className="px-3 py-3 text-right">
        <button
          onClick={save}
          disabled={pending || !dirty}
          className="bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-30"
        >
          {pending ? "Lagrer …" : "Lagre"}
        </button>
        {saved && (
          <div className="mt-1 text-[11px] font-semibold text-accent-soft">
            Lagret ✓
          </div>
        )}
        {err && <div className="mt-1 text-[11px] text-danger">{err}</div>}
      </td>
    </tr>
  );
}

export function PriceMatrix({ services }: { services: MatrixService[] }) {
  // Grupper tjenestene på kategori (rekkefølgen er allerede sortert).
  const groups = useMemo(() => {
    const out: { category: string; items: MatrixService[] }[] = [];
    for (const s of services) {
      const last = out[out.length - 1];
      if (last && last.category === s.category) last.items.push(s);
      else out.push({ category: s.category, items: [s] });
    }
    return out;
  }, [services]);

  return (
    <div className="space-y-8">
      <p className="border border-accent-soft/25 bg-accent-soft/5 px-4 py-3 text-xs text-muted">
        Øverste felt = <strong className="text-fg">pris (kr)</strong>, nederste ={" "}
        <strong className="text-fg">varighet (min)</strong>. La feltet stå tomt
        for å bruke tjenestens grunnverdi (placeholder viser den). Endringer
        lagres per tjeneste-rad.
      </p>

      {groups.map((g) => (
        <div key={g.category} className="overflow-x-auto border border-line bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">{g.category}</th>
                {STAFF_LEVELS.map((l) => (
                  <th key={l} className="px-2 py-3">
                    {LEVEL_LABEL[l]}
                  </th>
                ))}
                <th className="px-3 py-3 text-right">Lagre</th>
              </tr>
            </thead>
            <tbody>
              {g.items.map((s) => (
                <ServiceRow key={s.id} svc={s} />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
