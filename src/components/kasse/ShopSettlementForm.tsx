"use client";

import { useState, useTransition } from "react";
import type { MethodBreakdown } from "@/lib/ops-queries";
import {
  deliverShopSettlement,
  dateSettlementInfo,
  type DateSettlementInfo,
} from "@/app/kasse/kasseoppgjor/actions";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
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

function Avvik({ diff }: { diff: number }) {
  if (diff === 0)
    return <span className="text-xs font-semibold text-accent-soft">✓ stemmer</span>;
  return (
    <span className="text-xs font-semibold text-danger" title="Talt minus forventet">
      {signedKr(diff)} {diff > 0 ? "(overskudd)" : "(manko)"}
    </span>
  );
}

export function ShopSettlementForm({
  today,
  initial,
  missing,
}: {
  today: string;
  initial: DateSettlementInfo;
  missing: { date: string; salesTotal: number }[];
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [date, setDate] = useState(today);
  const [info, setInfo] = useState<DateSettlementInfo>(initial);
  const [loading, setLoading] = useState(false);
  const [counted, setCounted] = useState<Record<string, string>>({
    counted_cash: "",
    counted_card: "",
    counted_vipps: "",
  });

  function switchDate(d: string) {
    setDate(d);
    setErr(null);
    setDone(false);
    setCounted({ counted_cash: "", counted_card: "", counted_vipps: "" });
    setLoading(true);
    dateSettlementInfo(d)
      .then((res) => setInfo(res))
      .finally(() => setLoading(false));
  }

  const expected = info.expected;
  const countedNum = (field: string) => {
    const n = Number(counted[field]);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  };
  const countedTotal =
    countedNum("counted_cash") +
    countedNum("counted_card") +
    countedNum("counted_vipps");
  const expectedTotal = expected.cash + expected.card + expected.vipps;

  const delivered = info.delivered || done;

  return (
    <div className="space-y-6">
      {/* Dato + eventuelle dager som mangler oppgjør */}
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Dato">
          <Input
            type="date"
            value={date}
            max={today}
            onChange={(e) => switchDate(e.target.value)}
            className="max-w-[12rem]"
          />
        </Field>
        {date !== today && (
          <Button
            variant="ghost"
            onClick={() => switchDate(today)}
            className="px-3 py-2 text-sm"
          >
            I dag
          </Button>
        )}
      </div>

      {missing.length > 0 && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          <p className="font-semibold text-danger">Dager som mangler oppgjør</p>
          <p className="mt-1 text-muted">
            Trykk på en dato for å levere oppgjøret for den dagen:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {missing.map((m) => (
              <button
                key={m.date}
                type="button"
                onClick={() => switchDate(m.date)}
                className={
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors " +
                  (date === m.date
                    ? "border-danger bg-danger/15 text-danger"
                    : "border-line-2 text-fg hover:border-danger")
                }
              >
                {no(m.date)} · {kr(Math.round(m.salesTotal))}
              </button>
            ))}
          </div>
        </div>
      )}

      {delivered ? (
        <Card>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-accent-soft" aria-hidden>
              ✓
            </span>
            <div>
              <p className="font-semibold text-fg">
                Oppgjør levert for {no(date)}
              </p>
              {info.counted && (
                <p className="mt-1 text-sm text-muted">
                  Talt opp: Kontant {kr(info.counted.cash)} · Kort{" "}
                  {kr(info.counted.card)} · Vipps {kr(info.counted.vipps)} ={" "}
                  <span className="font-semibold text-fg">
                    {kr(
                      info.counted.cash +
                        info.counted.card +
                        info.counted.vipps,
                    )}
                  </span>
                </p>
              )}
              {info.note && (
                <p className="mt-1 text-sm text-muted">Notat: {info.note}</p>
              )}
              <p className="mt-2 text-xs text-muted">
                Dagen er ferdig. Trenger du å rette et levert oppgjør, kontakt
                admin/eier.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <form
          action={(fd) =>
            start(async () => {
              setErr(null);
              fd.set("settle_date", date);
              const res = await deliverShopSettlement(fd);
              if (res.error) {
                setErr(res.error);
                return;
              }
              setDone(true);
            })
          }
          className="space-y-4 border border-line bg-surface p-5"
        >
          <p className="text-sm text-muted">
            Tell opp kassa og fyll inn hva du faktisk har i kontant, på kort og
            på Vipps. «Forventet» kommer automatisk fra salgene i kassen.
          </p>
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
                      {loading ? "…" : kr(exp)}
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
                  {loading ? "…" : kr(expectedTotal)}
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
          <Button
            type="submit"
            variant="primary"
            disabled={pending || loading}
            className="px-4 py-2 text-sm"
          >
            {pending ? "Leverer …" : "Lever oppgjør"}
          </Button>
        </form>
      )}
    </div>
  );
}
