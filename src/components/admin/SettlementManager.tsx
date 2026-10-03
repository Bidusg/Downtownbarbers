"use client";

import { useState, useTransition } from "react";
import type { CashSettlement, MethodBreakdown } from "@/lib/ops-queries";
import {
  createSettlement,
  deleteSettlement,
  expectedByMethod,
} from "@/app/admin/kasseoppgjor/actions";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import { Input, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

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
        <Button
          variant="primary"
          onClick={() => (open ? setOpen(false) : openForm())}
          className="px-4 py-2 text-sm"
        >
          {open ? "Lukk" : "+ Nytt oppgjør"}
        </Button>
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
          <Button
            type="submit"
            variant="primary"
            disabled={pending}
            className="px-4 py-2 text-sm"
          >
            Lagre oppgjør
          </Button>
        </form>
      )}

      <Card padded={false}>
        <Table>
          <THead>
            <Tr head className="bg-surface-2">
              <Th>Dato</Th>
              <Th align="right">Talt</Th>
              <Th align="right">Forventet</Th>
              <Th align="right">Avvik</Th>
              <Th>Notat</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {settlements.length === 0 && (
              <TableEmpty colSpan={6}>Ingen oppgjør registrert enda.</TableEmpty>
            )}
            {settlements.map((s) => {
              const expTotal = settlementExpectedTotal(s);
              return (
                <Tr key={s.id}>
                  <Td className="font-medium text-fg">{no(s.settle_date)}</Td>
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
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
