"use client";

import { useMemo, useState, useTransition } from "react";
import type { CashSettlement, MethodBreakdown } from "@/lib/ops-queries";
import {
  createSettlement,
  deleteSettlement,
  expectedByMethod,
} from "@/app/admin/kasseoppgjor/actions";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { Input, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ConfirmButton } from "@/components/ui/ConfirmButton";

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

/* ---------- Uke-hjelpere (datoer som «YYYY-MM-DD», regnet i UTC) ---------- */
const DAY_MS = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
function mondayOf(iso: string): string {
  const d = toDate(iso);
  const dow = (d.getUTCDay() + 6) % 7; // man = 0
  return toIso(new Date(d.getTime() - dow * DAY_MS));
}
const addDays = (iso: string, n: number) => toIso(new Date(toDate(iso).getTime() + n * DAY_MS));
function isoWeek(iso: string): number {
  const d = toDate(iso);
  const thu = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * DAY_MS);
  const jan1 = Date.UTC(thu.getUTCFullYear(), 0, 1);
  return Math.floor((thu.getTime() - jan1) / DAY_MS / 7) + 1;
}
const WEEKDAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];
function shortRange(mon: string) {
  const f = (iso: string) =>
    toDate(iso).toLocaleDateString("nb-NO", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${f(mon)} – ${f(addDays(mon, 6))} ${toDate(addDays(mon, 6)).getUTCFullYear()}`;
}

export function SettlementManager({
  settlements,
  defaultDate,
}: {
  settlements: CashSettlement[];
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  // Uke-visning: én uke om gangen, mandag–søndag.
  const thisWeek = mondayOf(defaultDate);
  const oldestWeek = useMemo(
    () => settlements.reduce((w, s) => (mondayOf(s.settle_date) < w ? mondayOf(s.settle_date) : w), thisWeek),
    [settlements, thisWeek],
  );
  const [week, setWeek] = useState(thisWeek);
  const byDate = useMemo(() => {
    const m = new Map<string, CashSettlement[]>();
    for (const s of settlements) {
      const list = m.get(s.settle_date) ?? [];
      list.push(s);
      m.set(s.settle_date, list);
    }
    return m;
  }, [settlements]);
  const weekSum = useMemo(() => {
    let counted = 0;
    let expected = 0;
    let countedWithExp = 0;
    let anyExpected = false;
    for (let i = 0; i < 7; i++) {
      for (const s of byDate.get(addDays(week, i)) ?? []) {
        counted += Number(s.total_nok) || 0;
        const e = settlementExpectedTotal(s);
        if (e != null) {
          anyExpected = true;
          expected += e;
          countedWithExp += Number(s.total_nok) || 0;
        }
      }
    }
    return { counted, expected, diff: countedWithExp - expected, anyExpected };
  }, [byDate, week]);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

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
        <Button
          variant="primary"
          onClick={() => {
            setErr(null);
            if (open) setOpen(false);
            else openForm();
          }}
          className="px-4 py-2 text-sm"
        >
          {open ? "Lukk" : "+ Nytt oppgjør"}
        </Button>
      </div>

      {open && (
        <form
          action={(fd) =>
            start(async () => {
              setErr(null);
              const res = await createSettlement(fd);
              if (res.error) {
                setErr(res.error);
                return;
              }
              setCounted({ counted_cash: "", counted_card: "", counted_vipps: "" });
              setOpen(false);
            })
          }
          className="space-y-4 border border-line bg-surface p-5"
        >
          <Field label="Dato">
            <Input
              name="settle_date"
              type="date"
              required
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                loadExpected(e.target.value);
              }}
              className="max-w-[12rem]"
            />
          </Field>

          <Table>
            <THead>
              <Tr head>
                <Th>Betalingsmåte</Th>
                <Th align="right">Forventet</Th>
                <Th align="right">Talt</Th>
                <Th align="right">Avvik</Th>
              </Tr>
            </THead>
            <TBody>
              {METHODS.map((m) => {
                const exp = expected[m.key];
                const cnt = countedNum(m.field);
                return (
                  <Tr key={m.key}>
                    <Td className="font-medium text-fg">{m.label}</Td>
                    <Td align="right" muted nums>
                      {loadingExp ? "…" : kr(exp)}
                    </Td>
                    <Td align="right">
                      <Input
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
                        className="w-28 text-right"
                      />
                    </Td>
                    <Td align="right">
                      <Avvik diff={cnt - exp} />
                    </Td>
                  </Tr>
                );
              })}
              <Tr className="border-t border-line-2">
                <Td className="font-semibold text-fg">Sum</Td>
                <Td align="right" muted nums className="font-semibold">
                  {loadingExp ? "…" : kr(expectedTotal)}
                </Td>
                <Td align="right" nums className="font-semibold text-fg">
                  {kr(countedTotal)}
                </Td>
                <Td align="right">
                  <Avvik diff={countedTotal - expectedTotal} />
                </Td>
              </Tr>
            </TBody>
          </Table>

          <Input
            name="note"
            placeholder="Notat (valgfritt) – f.eks. forklaring på avvik"
          />
          {err && <p className="text-sm text-danger">{err}</p>}
          {!Object.values(counted).some((v) => v.trim() !== "") && (
            <p className="text-xs text-muted">Fyll inn talte beløp for å kunne lagre.</p>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={pending || !Object.values(counted).some((v) => v.trim() !== "")}
            className="px-4 py-2 text-sm"
          >
            {pending ? "Lagrer …" : "Lagre oppgjør"}
          </Button>
        </form>
      )}

      <Card padded={false} className="overflow-hidden">
        {/* Uke-velger */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <button
            type="button"
            onClick={() => setWeek((w) => addDays(w, -7))}
            disabled={week <= oldestWeek}
            className="act"
            aria-label="Forrige uke"
          >
            ‹ Forrige uke
          </button>
          <div className="text-center">
            <p className="text-[15px] font-semibold text-fg">Uke {isoWeek(week)}</p>
            <p className="text-xs text-muted">{shortRange(week)}</p>
          </div>
          <div className="flex items-center gap-2">
            {week !== thisWeek && (
              <button type="button" onClick={() => setWeek(thisWeek)} className="act">
                Denne uka
              </button>
            )}
            <button
              type="button"
              onClick={() => setWeek((w) => addDays(w, 7))}
              disabled={week >= thisWeek}
              className="act"
              aria-label="Neste uke"
            >
              Neste uke ›
            </button>
          </div>
        </div>
        <Table>
          <THead>
            <Tr head>
              <Th>Dag</Th>
              <Th align="right">Talt</Th>
              <Th align="right">Forventet</Th>
              <Th align="right">Avvik</Th>
              <Th>Notat</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {(() => {
              const rows = WEEKDAYS.map((wd, i) => {
                const iso = addDays(week, i);
                const list = byDate.get(iso) ?? [];
                const future = iso > defaultDate;
                if (list.length === 0) {
                  return (
                    <Tr key={iso}>
                      <Td>
                        <span className="font-medium text-fg">{wd}</span>{" "}
                        <span className="text-muted">{no(iso)}</span>
                      </Td>
                      <Td align="right" muted>—</Td>
                      <Td align="right" muted>—</Td>
                      <Td align="right">
                        <span className="text-xs text-muted">
                          {future ? "" : i === 6 ? "stengt / ikke tatt" : "ikke tatt"}
                        </span>
                      </Td>
                      <Td muted>—</Td>
                      <Td></Td>
                    </Tr>
                  );
                }
                return list.map((s, k) => {
                  const expTotal = settlementExpectedTotal(s);
                  return (
                    <Tr key={s.id}>
                      <Td>
                        <span className="font-medium text-fg">{wd}</span>{" "}
                        <span className="text-muted">{no(iso)}</span>
                        {list.length > 1 && (
                          <span className="ml-2 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                            {k + 1} av {list.length}
                          </span>
                        )}
                      </Td>
                      <Td align="right" nums className="font-display text-accent-soft">
                        {kr(s.total_nok)}
                      </Td>
                      <Td align="right" muted nums>
                        {expTotal == null ? "—" : kr(expTotal)}
                      </Td>
                      <Td align="right">
                        {expTotal == null ? (
                          <span className="text-xs text-muted">uten avstemming</span>
                        ) : (
                          <Avvik diff={s.total_nok - expTotal} />
                        )}
                      </Td>
                      <Td muted>{s.note ?? "—"}</Td>
                      <Td align="right">
                        <ConfirmButton
                          label="Slett"
                          question="Slette dette oppgjøret?"
                          confirmLabel="Ja, slett"
                          pendingLabel="Sletter …"
                          disabled={pending}
                          onConfirm={() => deleteSettlement(s.id)}
                        />
                      </Td>
                    </Tr>
                  );
                });
              });
              return (
                <>
                  {rows}
                  <Tr className="border-t border-line-2 bg-surface-2/60">
                    <Td className="font-semibold text-fg">Sum uke {isoWeek(week)}</Td>
                    <Td align="right" nums className="font-semibold text-fg">
                      {kr(weekSum.counted)}
                    </Td>
                    <Td align="right" muted nums className="font-semibold">
                      {weekSum.anyExpected ? kr(weekSum.expected) : "—"}
                    </Td>
                    <Td align="right">{weekSum.anyExpected ? <Avvik diff={weekSum.diff} /> : null}</Td>
                    <Td></Td>
                    <Td></Td>
                  </Tr>
                </>
              );
            })()}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
