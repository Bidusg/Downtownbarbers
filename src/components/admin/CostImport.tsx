"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { applyCostImport, previewCostImport, type ApplyResult, type PreviewResult } from "@/app/admin/varemargin/import-actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FileInput } from "@/components/ui/FileInput";
import type { UnmatchedItem } from "@/lib/cost-import";

const kr = (n: number | null) =>
  n === null ? "–" : n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";

function csvCell(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadUnmatched(rows: UnmatchedItem[]) {
  const head = ["Linje", "Varenavn", "Merke", "Strekkode", "Innkjøpspris", "Merknad", "Årsak"];
  const lines = rows.map((r) => [r.line, r.name, r.brand, r.barcode ? `'${r.barcode}` : null, r.cost, r.note, r.reason].map(csvCell).join(";"));
  const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ikke-matchet.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function CostImport({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<Extract<PreviewResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [fileKey, setFileKey] = useState(0);
  const [result, setResult] = useState<ApplyResult | null>(null);

  function onFile(form: HTMLFormElement) {
    const fd = new FormData(form);
    setError(null);
    setResult(null);
    setPreview(null);
    setFileKey((k) => k + 1);
    start(async () => {
      try {
        const r = await previewCostImport(fd);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setPreview(r);
        setChecked(new Set(r.result.matched.map((m) => m.productId)));
      } catch {
        setError("Noe gikk galt under lesing av fila.");
      }
    });
  }

  function save() {
    if (!preview) return;
    const items = preview.result.matched
      .filter((m) => checked.has(m.productId))
      .map((m) => ({ product_id: m.productId, cost: m.newCost, note: m.note, isEstimate: m.isEstimate }));
    if (items.length === 0) return;
    setError(null);
    start(async () => {
      try {
        const r = await applyCostImport(items);
        setResult(r);
        if (r.saved > 0) {
          setPreview(null);
          setFileKey((k) => k + 1);
          router.refresh();
        }
      } catch {
        setError("Lagring feilet.");
      }
    });
  }

  const res = preview?.result;
  const toggle = (id: string) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Card title="Importer innkjøpspriser">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Last opp .xlsx eller .csv med strekkode/varenavn og innkjøpspris (eks. mva). Kolonnen «Brukt innkjøp» brukes først, deretter «Innkjøpspris», «Kostpris», «Innpris». Du ser en forhåndsvisning før noe lagres.
        </p>
        <form
          onChange={(e) => {
            if (e.target instanceof HTMLInputElement && e.target.type === "file") onFile(e.currentTarget);
          }}
        >
          <FileInput key={fileKey} name="file" accept=".xlsx,.csv" buttonLabel="Velg fil" />
        </form>
        {pending && <p className="text-sm text-muted" role="status">Jobber …</p>}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        {disabled && <p className="text-sm text-danger">Lagring krever KJØR-I-SUPABASE-INNKJOPSPRIS.sql.</p>}

        {result && (
          <div className="space-y-1 text-sm" role="status">
            <p className="font-semibold text-fg">Lagret {result.saved} innkjøpspriser.</p>
            {result.warning && <p className="text-muted">{result.warning}</p>}
            {result.errors.length > 0 && (
              <ul className="list-disc pl-5 text-danger">
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {preview && res && (
          <div className="space-y-5">
            <p className="text-sm text-muted">
              {preview.fileName}: {preview.rowCount} rader, innkjøpskolonne «{preview.costHeader}».
            </p>
            {preview.warnings.map((w, i) => (
              <p key={i} className="text-sm text-danger">{w}</p>
            ))}
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone="success">{res.matched.length} matchet</Badge>
              <Badge tone="warning">{res.priceDiffs.length} prisavvik</Badge>
              <Badge tone="danger">{res.unmatched.length} ikke matchet</Badge>
              <Badge tone="neutral">{res.ambiguous.length} flertydig</Badge>
            </div>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-fg">Matchet ({checked.size} valgt)</h3>
                <div className="flex gap-2">
                  <Button type="button" variant="subtle" className="px-3 py-1 text-xs" onClick={() => setChecked(new Set(res.matched.map((m) => m.productId)))}>
                    Velg alle
                  </Button>
                  <Button type="button" variant="subtle" className="px-3 py-1 text-xs" onClick={() => setChecked(new Set())}>
                    Fjern alle
                  </Button>
                </div>
              </div>
              <div className="max-h-96 overflow-auto border border-line">
                <table className="w-full min-w-[640px] text-sm tabular-nums">
                  <thead className="sticky top-0 bg-surface text-xs text-muted">
                    <tr className="border-b border-line text-left">
                      <th className="w-10 px-3 py-2"><span className="sr-only">Velg</span></th>
                      <th className="px-3 py-2">Vare</th>
                      <th className="px-3 py-2 text-right">Gammel</th>
                      <th className="px-3 py-2 text-right">Ny</th>
                      <th className="px-3 py-2 text-right">Endring</th>
                      <th className="px-3 py-2">Kilde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.matched.map((m) => {
                      const delta = m.oldCost === null ? null : m.newCost - m.oldCost;
                      return (
                        <tr key={m.productId} className="border-b border-line last:border-0">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              aria-label={`Velg ${m.productName}`}
                              checked={checked.has(m.productId)}
                              onChange={() => toggle(m.productId)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            {m.productName}
                            <span className="ml-2 text-xs text-muted">via {m.matchedBy}</span>
                          </td>
                          <td className="px-3 py-2 text-right">{kr(m.oldCost)}</td>
                          <td className="px-3 py-2 text-right">{kr(m.newCost)}</td>
                          <td className="px-3 py-2 text-right">
                            {delta === null ? "ny" : delta === 0 ? "uendret" : (delta > 0 ? "+" : "") + kr(delta)}
                          </td>
                          <td className="px-3 py-2">{m.isEstimate ? <Badge tone="warning">anslag</Badge> : <span className="text-muted">import</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Button type="button" onClick={save} disabled={pending || disabled || checked.size === 0} className="px-4 py-2 text-sm">
                Lagre {checked.size} innkjøpspriser
              </Button>
            </section>

            {res.priceDiffs.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-fg">Prisavvik (utsalgspris endres ikke)</h3>
                <ul className="max-h-60 divide-y divide-line overflow-auto border border-line text-sm tabular-nums">
                  {res.priceDiffs.map((m) => (
                    <li key={m.productId} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                      <span>{m.productName}</span>
                      <span className="text-muted">
                        fil {kr(m.filePrice)} mot database {kr(m.dbPrice)} (inkl. mva)
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(res.unmatched.length > 0 || res.ambiguous.length > 0) && (
              <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-fg">
                    Ikke matchet ({res.unmatched.length}) og flertydige ({res.ambiguous.length})
                  </h3>
                  <Button type="button" variant="subtle" className="px-3 py-1 text-xs" onClick={() => downloadUnmatched([...res.unmatched, ...res.ambiguous])}>
                    Last ned som CSV
                  </Button>
                </div>
                <ul className="max-h-60 divide-y divide-line overflow-auto border border-line text-sm">
                  {[...res.unmatched, ...res.ambiguous].map((u) => (
                    <li key={u.line} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                      <span>
                        <span className="text-muted">Linje {u.line}:</span> {u.name || u.barcode}
                      </span>
                      <span className="text-muted">{u.reason}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
