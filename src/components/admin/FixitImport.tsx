"use client";

import { useMemo, useState, useTransition } from "react";
import {
  previewFixitImport,
  applyFixitImport,
  type FixitPreviewDay,
} from "@/app/admin/kasseoppgjor/actions";
import type { FixitSettlementRow } from "@/lib/fixit-settlement";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";

const kr = (n: number) => Math.round(n).toLocaleString("nb-NO") + " kr";
const signed = (n: number) =>
  (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("nb-NO") + " kr";
const no = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

/**
 * Importer Fixit-rapporten «Kasseoppgjør» (PDF): les den, vis den dag for dag
 * ved siden av det nye systemet, og lagre Fixit-tallene + overstyr kort/Vipps
 * (og evt. kontant) i dagsoppgjøret for dagene du velger.
 */
export function FixitImport() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [period, setPeriod] = useState<string | null>(null);
  const [rows, setRows] = useState<FixitSettlementRow[] | null>(null);
  const [days, setDays] = useState<FixitPreviewDay[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [opt, setOpt] = useState({ card: true, vipps: true, cash: false });

  const totals = useMemo(() => {
    const t = { fixit: 0, ours: 0, fixitCard: 0, oursCard: 0 };
    for (const d of days) {
      t.fixit += d.fixit.total;
      t.ours += d.ours.salesTotal;
      t.fixitCard += d.fixit.card;
      t.oursCard += d.ours.card;
    }
    return t;
  }, [days]);

  function read(fd: FormData) {
    start(async () => {
      setErr(null);
      setMsg(null);
      const r = await previewFixitImport(fd);
      if (r.error || !r.rows || !r.days) {
        setErr(r.error ?? "Kunne ikke lese filen.");
        return;
      }
      setRows(r.rows);
      setDays(r.days);
      setPeriod(r.period ?? null);
      setPicked(new Set(r.days.map((d) => d.date)));
    });
  }

  function apply() {
    if (!rows) return;
    start(async () => {
      setErr(null);
      const r = await applyFixitImport(rows, { ...opt, dates: [...picked] });
      if (r.error) {
        setErr(r.error);
        return;
      }
      setMsg(
        `Lagret ${r.saved} Fixit-oppgjør` +
          (r.overridden ? ` og overstyrte ${r.overridden} dager i kasseoppgjøret.` : ". Ingen dager overstyrt."),
      );
      setRows(null);
      setDays([]);
    });
  }

  function toggle(date: string) {
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(date)) n.delete(date);
      else n.add(date);
      return n;
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Importer fra Fixit</h2>
          <p className="mt-1 text-sm text-muted">
            Last opp Fixit-rapporten «Kasseoppgjør» (PDF). Du ser Fixit og det nye systemet dag for dag,
            og kan bruke Fixit-tallene som riktige kort- og Vipps-beløp i kasseoppgjøret.
          </p>
        </div>
        <Button variant="subtle" onClick={() => setOpen((o) => !o)} className="px-4 py-2 text-sm">
          {open ? "Lukk" : "Importer PDF"}
        </Button>
      </div>

      {open && (
        <div className="mt-5 space-y-5">
          <form action={read} className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="file"
              accept="application/pdf,.pdf"
              required
              className="text-sm text-fg file:mr-3 file:rounded-lg file:border file:border-line-2 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:text-fg"
            />
            <Button type="submit" variant="primary" disabled={pending} className="px-4 py-2 text-sm">
              {pending && !rows ? "Leser …" : "Les PDF"}
            </Button>
          </form>

          {err && <p className="text-sm text-danger">{err}</p>}
          {msg && <p role="status" className="text-sm text-fg">{msg}</p>}

          {rows && days.length > 0 && (
            <>
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-lg border border-line p-3">
                  <p className="text-xs text-muted">Fixit {period ?? ""}</p>
                  <p className="font-display text-lg font-bold">{kr(totals.fixit)}</p>
                  <p className="text-xs text-muted">{rows.length} oppgjør · {days.length} dager</p>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <p className="text-xs text-muted">Nytt system, samme dager</p>
                  <p className="font-display text-lg font-bold">{kr(totals.ours)}</p>
                  <p className="text-xs text-muted">registrert salg i kassen</p>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <p className="text-xs text-muted">Forskjell (Fixit − nytt)</p>
                  <p className="font-display text-lg font-bold text-danger">{signed(totals.fixit - totals.ours)}</p>
                  <p className="text-xs text-muted">kort: {signed(totals.fixitCard - totals.oursCard)}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table className="min-w-[760px]">
                  <THead>
                    <Tr head>
                      <Th>
                        <input
                          type="checkbox"
                          aria-label="Velg alle dager"
                          checked={picked.size === days.length}
                          onChange={() =>
                            setPicked(picked.size === days.length ? new Set() : new Set(days.map((d) => d.date)))
                          }
                        />
                      </Th>
                      <Th>Dato</Th>
                      <Th align="right">Fixit totalt</Th>
                      <Th align="right">Nytt totalt</Th>
                      <Th align="right">Forskjell</Th>
                      <Th align="right">Fixit kort</Th>
                      <Th align="right">Nytt kort</Th>
                      <Th align="right">Fixit Vipps/annet</Th>
                      <Th align="right">Nytt Vipps</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {days.map((d) => {
                      const diff = d.fixit.total - d.ours.salesTotal;
                      return (
                        <Tr key={d.date}>
                          <Td>
                            <input
                              type="checkbox"
                              aria-label={`Bruk Fixit for ${no(d.date)}`}
                              checked={picked.has(d.date)}
                              onChange={() => toggle(d.date)}
                            />
                          </Td>
                          <Td className="font-medium text-fg">
                            {no(d.date)}
                            <span className="block text-[11px] text-muted">
                              nr {d.nrs.join(", ")}
                              {d.nrs.length > 1 ? " · flere oppgjør" : ""}
                            </span>
                          </Td>
                          <Td align="right" nums className="text-fg">{kr(d.fixit.total)}</Td>
                          <Td align="right" nums muted>{kr(d.ours.salesTotal)}</Td>
                          <Td align="right" nums className={Math.abs(diff) >= 1 ? "text-danger" : "text-muted"}>
                            {Math.abs(diff) >= 1 ? signed(diff) : "lik"}
                          </Td>
                          <Td align="right" nums>{kr(d.fixit.card)}</Td>
                          <Td align="right" nums muted>{kr(d.ours.counted?.card ?? d.ours.card)}</Td>
                          <Td align="right" nums>{kr(d.fixit.other)}</Td>
                          <Td align="right" nums muted>{kr(d.ours.counted?.vipps ?? d.ours.vipps)}</Td>
                        </Tr>
                      );
                    })}
                  </TBody>
                </Table>
              </div>

              <fieldset className="space-y-2 rounded-lg border border-line p-4 text-sm">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  Overstyr kasseoppgjøret for valgte dager ({picked.size})
                </legend>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={opt.card} onChange={(e) => setOpt({ ...opt, card: e.target.checked })} />
                  Kort = Fixit bankkort + kredittkort
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={opt.vipps} onChange={(e) => setOpt({ ...opt, vipps: e.target.checked })} />
                  Vipps = det Fixit ikke fører på noen betalingsmåte
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={opt.cash} onChange={(e) => setOpt({ ...opt, cash: e.target.checked })} />
                  Kontant = Fixits kontant
                  <span className="text-xs text-muted">(av som standard – Fixit fører 0 i kontant, opptellingen i kassa er riktigere)</span>
                </label>
                <p className="text-xs text-muted">
                  Fixit-tallene lagres uansett, så de kan sammenlignes i dag for dag-visningen og PDF-rapporten.
                  Overstyring logges i historikken på hvert oppgjør.
                </p>
              </fieldset>

              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={apply} disabled={pending} className="px-4 py-2 text-sm">
                  {pending ? "Lagrer …" : `Lagre Fixit-tallene${opt.card || opt.vipps || opt.cash ? " og overstyr" : ""}`}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRows(null);
                    setDays([]);
                  }}
                  disabled={pending}
                  className="px-4 py-2 text-sm"
                >
                  Avbryt
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
