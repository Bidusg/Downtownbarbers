"use client";

import { useState, useTransition } from "react";
import { parseHistoryPdf, saveHistory, type PdfPreview } from "@/app/admin/historikk/actions";

const MND = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
const kr = (n: number) => Math.round(n).toLocaleString("nb-NO");
const monthLabel = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return `${MND[mm - 1]} ${y}`;
};

type Item = PdfPreview & { pick: Record<string, boolean> };

export function HistoryImporter({ staff }: { staff: { id: string; name: string }[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [reading, setReading] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSave] = useTransition();

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setMsg(null);
    const list = Array.from(files).filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    setReading(list.length);
    for (const f of list) {
      const fd = new FormData();
      fd.append("file", f);
      let p: PdfPreview;
      try {
        p = await parseHistoryPdf(fd);
      } catch {
        p = { fileName: f.name, employee: null, staffId: null, months: [], warnings: [], error: "Opplastingen feilet." };
      }
      // Standard: kryss av alle måneder UTEN salg i nytt system (unngå dobbelt).
      const pick: Record<string, boolean> = {};
      p.months.forEach((m) => (pick[m.month] = m.liveSalesNok === 0));
      setItems((cur) => [...cur, { ...p, pick }]);
      setReading((n) => n - 1);
    }
  }

  const update = (i: number, patch: Partial<Item>) =>
    setItems((cur) => cur.map((it, k) => (k === i ? { ...it, ...patch } : it)));

  const selectedCount = items.reduce(
    (s, it) => s + (it.staffId ? it.months.filter((m) => it.pick[m.month]).length : 0),
    0,
  );

  function save() {
    const rows = items.flatMap((it) =>
      it.staffId
        ? it.months
            .filter((m) => it.pick[m.month])
            .map((m) => ({
              month: m.month,
              hours: m.hours,
              visits: m.visits,
              treatmentNok: m.treatmentNok,
              productNok: m.productNok,
              totalNok: m.totalNok,
              staffId: it.staffId as string,
              source: it.fileName,
            }))
        : [],
    );
    startSave(async () => {
      const r = await saveHistory(rows);
      if (r.error) setMsg({ ok: false, text: r.error });
      else {
        setMsg({ ok: true, text: `Lagret ${r.count} måneder ✓` });
        setItems([]);
      }
    });
  }

  return (
    <div className="mt-5 space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line-2 px-4 py-8 text-center transition-colors hover:border-accent-soft">
        <span className="text-sm font-semibold text-fg">Velg PDF-er («Omsetning en ansatt»)</span>
        <span className="text-xs text-muted">Én per ansatt – du kan velge flere samtidig</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {reading > 0 && <p className="text-sm text-muted">Leser {reading} PDF-er …</p>}

      {items.map((it, i) => (
        <div key={i} className="rounded-lg border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg">{it.employee ?? "Ukjent ansatt"}</p>
              <p className="truncate text-xs text-muted">{it.fileName}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={it.staffId ?? ""}
                onChange={(e) => update(i, { staffId: e.target.value || null })}
                className={
                  "rounded-md border bg-canvas px-2 py-1.5 text-sm " +
                  (it.staffId ? "border-line-2" : "border-danger")
                }
              >
                <option value="">Velg ansatt …</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setItems((cur) => cur.filter((_, k) => k !== i))}
                className="act"
              >
                Fjern
              </button>
            </div>
          </div>

          {it.error && <p className="px-4 py-3 text-sm text-danger">{it.error}</p>}
          {it.warnings.map((w) => (
            <p key={w} className="px-4 pt-2 text-xs text-danger">{w}</p>
          ))}

          {it.months.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2 text-left font-medium">Ta med</th>
                    <th className="px-2 py-2 text-left font-medium">Måned</th>
                    <th className="px-2 py-2 text-right font-medium">Timer</th>
                    <th className="px-2 py-2 text-right font-medium">Besøk</th>
                    <th className="px-2 py-2 text-right font-medium">Behandling</th>
                    <th className="px-2 py-2 text-right font-medium">Varesalg</th>
                    <th className="px-4 py-2 text-right font-medium">Sum (inkl. mva)</th>
                  </tr>
                </thead>
                <tbody>
                  {it.months.map((m) => (
                    <tr key={m.month} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-1.5">
                        <input
                          type="checkbox"
                          checked={!!it.pick[m.month]}
                          onChange={(e) => update(i, { pick: { ...it.pick, [m.month]: e.target.checked } })}
                          className="accent-accent"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-fg">
                        {monthLabel(m.month)}
                        {m.existing && <span className="ml-2 text-[10px] text-muted">(erstatter importert)</span>}
                        {m.liveSalesNok > 0 && (
                          <span
                            className="ml-2 text-[10px] text-danger"
                            title="Det finnes salg i det nye systemet denne måneden – tas den med, telles det dobbelt."
                          >
                            nytt system: {kr(m.liveSalesNok)} kr
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted">{m.hours.toLocaleString("nb-NO")}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted">{m.visits}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted">{kr(m.treatmentNok)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted">{kr(m.productNok)}</td>
                      <td className="px-4 py-1.5 text-right font-semibold tabular-nums text-fg">{kr(m.totalNok)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || selectedCount === 0}
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg disabled:opacity-50"
          >
            {saving ? "Lagrer …" : `Lagre ${selectedCount} måneder`}
          </button>
          {items.some((it) => !it.staffId && it.months.length) && (
            <span className="text-xs text-danger">Velg ansatt for alle PDF-er (de uten ansatt hoppes over).</span>
          )}
        </div>
      )}
      {msg && <p className={"text-sm " + (msg.ok ? "text-muted" : "text-danger")}>{msg.text}</p>}
    </div>
  );
}
