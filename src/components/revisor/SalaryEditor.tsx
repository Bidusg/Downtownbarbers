"use client";

import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { computeSalary } from "@/lib/salary/compute";
import { kr2 } from "@/lib/salary/format";
import type {
  SalarySettings,
  SalaryPeriodInputs,
  SalaryManualLine,
  SalaryContext,
} from "@/lib/salary/types";
import {
  saveSalarySettings,
  saveSalaryPeriod,
  addManualLine,
  deleteManualLine,
} from "@/app/revisor/ansatte/[id]/actions";

type Msg = { ok: boolean; text: string } | null;

function Row({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-fg">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Check({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 accent-[var(--accent)]"
    />
  );
}

/** Lite tallfelt. `pctOf100` viser prosent (sats lagres som brøk). */
function NumBox({
  value,
  onChange,
  step = "1",
  suffix,
  width = "w-24",
}: {
  value: number;
  onChange: (v: number) => void;
  step?: string;
  suffix?: string;
  width?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${width} text-right`}
      />
      {suffix && <span className="text-xs text-muted">{suffix}</span>}
    </span>
  );
}

export function SalaryEditor({
  staffId,
  year,
  month,
  monthLabel,
  initialSettings,
  initialPeriod,
  manualLines,
  context,
}: {
  staffId: string;
  year: number;
  month: number;
  monthLabel: string;
  initialSettings: SalarySettings;
  initialPeriod: SalaryPeriodInputs;
  manualLines: SalaryManualLine[];
  context: SalaryContext;
}) {
  const [s, setS] = useState<SalarySettings>(initialSettings);
  const [p, setP] = useState<SalaryPeriodInputs>(initialPeriod);
  const set = <K extends keyof SalarySettings>(k: K, v: SalarySettings[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));
  const setPer = <K extends keyof SalaryPeriodInputs>(k: K, v: SalaryPeriodInputs[K]) =>
    setP((prev) => ({ ...prev, [k]: v }));

  const [settingsMsg, setSettingsMsg] = useState<Msg>(null);
  const [periodMsg, setPeriodMsg] = useState<Msg>(null);
  const [lineMsg, setLineMsg] = useState<Msg>(null);
  const [savingSettings, startSettings] = useTransition();
  const [savingPeriod, startPeriod] = useTransition();
  const [addingLine, startLine] = useTransition();

  const result = useMemo(
    () => computeSalary(s, p, manualLines, context),
    [s, p, manualLines, context],
  );

  function saveSettings() {
    const fd = new FormData();
    fd.set("staffId", staffId);
    fd.set(
      "baseSalaryOverrideNok",
      s.baseSalaryOverrideNok == null ? "" : String(s.baseSalaryOverrideNok),
    );
    fd.set("commissionModel", s.commissionModel);
    fd.set("commissionRate", String(s.commissionRate));
    fd.set("commissionThresholdNok", String(s.commissionThresholdNok));
    fd.set("commissionExVat", s.commissionExVat ? "on" : "");
    fd.set("serviceRate", String(s.serviceRate));
    fd.set("productRate", String(s.productRate));
    fd.set("marketplaceRate", String(s.marketplaceRate));
    fd.set("enableMarketplace", s.enableMarketplace ? "on" : "");
    fd.set("enableEvening", s.enableEvening ? "on" : "");
    fd.set("eveningFrom", s.eveningFrom);
    fd.set("eveningRateNok", String(s.eveningRateNok));
    fd.set("enableSaturday", s.enableSaturday ? "on" : "");
    fd.set("saturdayFrom", s.saturdayFrom);
    fd.set("saturdayRateNok", String(s.saturdayRateNok));
    fd.set("enableSunday", s.enableSunday ? "on" : "");
    fd.set("sundayRateNok", String(s.sundayRateNok));
    fd.set("enableVacationPay", s.enableVacationPay ? "on" : "");
    fd.set("vacationPayRate", String(s.vacationPayRate));
    fd.set("enableHolidayBonus", s.enableHolidayBonus ? "on" : "");
    fd.set("holidayBonusNok", String(s.holidayBonusNok));
    fd.set("enableSickPay", s.enableSickPay ? "on" : "");
    fd.set("sickRateNok", String(s.sickRateNok));
    startSettings(async () => {
      setSettingsMsg(null);
      const res = await saveSalarySettings(fd);
      setSettingsMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Lagret ✓" });
    });
  }

  function savePeriod() {
    const fd = new FormData();
    fd.set("staffId", staffId);
    fd.set("year", String(year));
    fd.set("month", String(month));
    fd.set("eveningHours", String(p.eveningHours));
    fd.set("saturdayHours", String(p.saturdayHours));
    fd.set("sundayHours", String(p.sundayHours));
    fd.set("sickHours", String(p.sickHours));
    fd.set("vacationHours", String(p.vacationHours));
    fd.set("note", p.note);
    startPeriod(async () => {
      setPeriodMsg(null);
      const res = await saveSalaryPeriod(fd);
      setPeriodMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Lagret ✓" });
    });
  }

  function downloadReport() {
    const sep = ";";
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    // Rent desimaltall med komma, uten tusenskille (Excel nb-NO-vennlig).
    const amt = (n: number) => n.toFixed(2).replace(".", ",");
    const head = ["Type", "Formel", "Beløp"].join(sep);
    const body = result.lines
      .map((l) => [esc(l.label), esc(l.formula), amt(l.amountNok)].join(sep))
      .join("\n");
    const sum = ["Sum beregnet lønn (brutto)", "", amt(result.totalNok)].join(sep);
    const csv = "﻿" + [head, body, sum].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lonnsrapport-${staffId}-${year}-${String(month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const netExVat = context.grossInclVatNok / (1 + context.mva);

  return (
    <div className="space-y-8">
      {/* === Innstillingskort === */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* 1) Lønninger */}
        <Card title="Lønninger">
          <div className="divide-y divide-line">
            <Row label="Fastlønn (kr/mnd)">
              <NumBox
                value={s.baseSalaryOverrideNok ?? context.staffBaseSalaryNok}
                onChange={(v) => set("baseSalaryOverrideNok", v)}
                width="w-28"
                suffix="kr"
              />
            </Row>
            <Row label={<><Check checked={s.enableHolidayBonus} onChange={(v) => set("enableHolidayBonus", v)} /> <span className="ml-1">Feriebonus</span></>}>
              <NumBox value={s.holidayBonusNok} onChange={(v) => set("holidayBonusNok", v)} width="w-24" suffix="kr" />
            </Row>
            <Row label={<><Check checked={s.enableVacationPay} onChange={(v) => set("enableVacationPay", v)} /> <span className="ml-1">Ferielønn</span></>}>
              <NumBox value={s.vacationPayRate * 100} onChange={(v) => set("vacationPayRate", v / 100)} step="0.1" width="w-20" suffix="%" />
            </Row>
            <Row label={<><Check checked={s.enableSickPay} onChange={(v) => set("enableSickPay", v)} /> <span className="ml-1">Sykefravær</span></>}>
              <NumBox value={s.sickRateNok} onChange={(v) => set("sickRateNok", v)} width="w-24" suffix="kr/t" />
            </Row>
          </div>
          <p className="mt-3 text-xs text-muted">
            Fastlønn forhåndsutfylt fra ansattkortet. Feriebonus/ferielønn/sykefravær
            er forenklet i denne versjonen – se merknad i rapporten.
          </p>
        </Card>

        {/* 2) Bonus / tillegg */}
        <Card title="Bonus / tillegg">
          <div className="divide-y divide-line">
            <div className="py-1.5">
              <Row label={<><Check checked={s.enableEvening} onChange={(v) => set("enableEvening", v)} /> <span className="ml-1">Kveldstillegg</span></>}>
                <NumBox value={s.eveningRateNok} onChange={(v) => set("eveningRateNok", v)} width="w-20" suffix="kr/t" />
              </Row>
              <div className="flex items-center justify-end gap-1 text-xs text-muted">
                fra kl.
                <Input type="time" value={s.eveningFrom} onChange={(e) => set("eveningFrom", e.target.value)} className="w-24" />
              </div>
            </div>
            <div className="py-1.5">
              <Row label={<><Check checked={s.enableSaturday} onChange={(v) => set("enableSaturday", v)} /> <span className="ml-1">Lørdagstillegg</span></>}>
                <NumBox value={s.saturdayRateNok} onChange={(v) => set("saturdayRateNok", v)} width="w-20" suffix="kr/t" />
              </Row>
              <div className="flex items-center justify-end gap-1 text-xs text-muted">
                fra kl.
                <Input type="time" value={s.saturdayFrom} onChange={(e) => set("saturdayFrom", e.target.value)} className="w-24" />
              </div>
            </div>
            <Row label={<><Check checked={s.enableSunday} onChange={(v) => set("enableSunday", v)} /> <span className="ml-1">Søndagstillegg</span></>}>
              <NumBox value={s.sundayRateNok} onChange={(v) => set("sundayRateNok", v)} width="w-20" suffix="kr/t" />
            </Row>
          </div>
          <p className="mt-3 text-xs text-muted">
            Timer per tillegg legges inn under «Timer for perioden». Overtid og
            helligdagstillegg er ikke med ennå – bruk manuelle linjer.
          </p>
        </Card>

        {/* 3) Provisjon */}
        <Card title="Provisjon">
          <div className="divide-y divide-line">
            <Row label="Modell">
              <select
                value={s.commissionModel}
                onChange={(e) => set("commissionModel", e.target.value as "terskel" | "split")}
                className="rounded-md border border-line-2 bg-canvas px-2 py-1 text-sm text-fg"
              >
                <option value="terskel">Terskel (dagens)</option>
                <option value="split">Split (tjeneste/vare)</option>
              </select>
            </Row>
            {s.commissionModel === "terskel" ? (
              <>
                <Row label="Provisjonssats">
                  <NumBox value={s.commissionRate * 100} onChange={(v) => set("commissionRate", v / 100)} step="1" width="w-20" suffix="%" />
                </Row>
                <Row label="Terskel (grunnlag)">
                  <NumBox value={s.commissionThresholdNok} onChange={(v) => set("commissionThresholdNok", v)} width="w-28" suffix="kr" />
                </Row>
              </>
            ) : (
              <>
                <Row label="Tjeneste-provisjon">
                  <NumBox value={s.serviceRate * 100} onChange={(v) => set("serviceRate", v / 100)} step="1" width="w-20" suffix="%" />
                </Row>
                <Row label="Produktsalg">
                  <NumBox value={s.productRate * 100} onChange={(v) => set("productRate", v / 100)} step="1" width="w-20" suffix="%" />
                </Row>
                <Row label={<><Check checked={s.enableMarketplace} onChange={(v) => set("enableMarketplace", v)} /> <span className="ml-1">Markedsplass</span></>}>
                  <NumBox value={s.marketplaceRate * 100} onChange={(v) => set("marketplaceRate", v / 100)} step="1" width="w-20" suffix="%" />
                </Row>
              </>
            )}
            <Row label="Beregn uten mva">
              <Check checked={s.commissionExVat} onChange={(v) => set("commissionExVat", v)} />
            </Row>
          </div>
          <p className="mt-3 text-xs text-muted">
            Omsetning {monthLabel}: {kr2(context.grossInclVatNok)} inkl. mva ·{" "}
            {kr2(netExVat)} eks. mva.
          </p>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={saveSettings} disabled={savingSettings}>
          {savingSettings ? "Lagrer…" : "Lagre forandringer"}
        </Button>
        {settingsMsg && (
          <span className={settingsMsg.ok ? "text-sm text-accent-soft" : "text-sm text-danger"}>
            {settingsMsg.text}
          </span>
        )}
      </div>

      {/* === Timer for perioden === */}
      <Card title={`Timer for perioden – ${monthLabel} ${year}`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">Kveldstimer</span>
            <Input type="number" step="0.25" value={p.eveningHours} onChange={(e) => setPer("eveningHours", Number(e.target.value))} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">Lørdagstimer</span>
            <Input type="number" step="0.25" value={p.saturdayHours} onChange={(e) => setPer("saturdayHours", Number(e.target.value))} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">Søndagstimer</span>
            <Input type="number" step="0.25" value={p.sundayHours} onChange={(e) => setPer("sundayHours", Number(e.target.value))} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">Sykefravær (timer)</span>
            <Input type="number" step="0.25" value={p.sickHours} onChange={(e) => setPer("sickHours", Number(e.target.value))} />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={savePeriod} disabled={savingPeriod} variant="subtle" className="px-4 py-2 text-sm">
            {savingPeriod ? "Lagrer…" : "Lagre timer"}
          </Button>
          {periodMsg && (
            <span className={periodMsg.ok ? "text-sm text-accent-soft" : "text-sm text-danger"}>
              {periodMsg.text}
            </span>
          )}
        </div>
      </Card>

      {/* === Rapport === */}
      <Card
        title={`Rapport ${monthLabel} ${year}`}
        actions={
          <Button variant="link" onClick={downloadReport}>
            Last ned rapport (CSV)
          </Button>
        }
        padded={false}
      >
        <Table className="min-w-[640px]">
          <THead>
            <Tr head>
              <Th>Type</Th>
              <Th>Formel</Th>
              <Th align="right">Beløp</Th>
            </Tr>
          </THead>
          <TBody>
            {result.lines.map((l) => (
              <Tr key={l.key}>
                <Td className="font-medium text-fg">
                  {l.label}
                  {l.stubbed && (
                    <Badge tone="warning" className="ml-2">forenklet</Badge>
                  )}
                </Td>
                <Td muted className="text-xs">{l.formula}</Td>
                <Td align="right" nums className={l.amountNok < 0 ? "text-danger" : "text-fg"}>
                  {l.amountNok < 0 ? "−" : ""}{kr2(Math.abs(l.amountNok))}
                </Td>
              </Tr>
            ))}
          </TBody>
          <tfoot>
            <tr className="border-t border-line-2 bg-surface-2 font-semibold">
              <Td className="text-fg">Sammendrag</Td>
              <Td muted className="text-xs">Sum beregnet lønn (brutto, før skattetrekk)</Td>
              <Td align="right" nums className="font-display text-fg">{kr2(result.totalNok)}</Td>
            </tr>
          </tfoot>
        </Table>
      </Card>

      {/* === Manuelle trekk / tillegg === */}
      <Card title={`Manuelle trekk og tillegg – ${monthLabel} ${year}`}>
        <p className="mb-3 text-sm text-muted">
          Negativt beløp = trekk (f.eks. «tilbakebetaling lån» −2000, «forskudd lønn» −2000).
          Positivt beløp = tillegg. Linjene inngår i summen over.
        </p>
        <div className="space-y-2">
          {manualLines.length === 0 && (
            <p className="text-sm text-muted">Ingen manuelle linjer for perioden.</p>
          )}
          {manualLines.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 border border-line bg-surface px-3 py-2">
              <span className="text-sm text-fg">{m.label}</span>
              <div className="flex items-center gap-3">
                <span className={m.amountNok < 0 ? "text-sm text-danger tabular-nums" : "text-sm text-fg tabular-nums"}>
                  {m.amountNok < 0 ? "−" : "+"}{kr2(Math.abs(m.amountNok))}
                </span>
                <form
                  action={(fd) =>
                    startLine(async () => {
                      setLineMsg(null);
                      const res = await deleteManualLine(fd);
                      if (res.error) setLineMsg({ ok: false, text: res.error });
                    })
                  }
                >
                  <input type="hidden" name="staffId" value={staffId} />
                  <input type="hidden" name="id" value={m.id} />
                  <ConfirmButton submit label="Slett" question="Slette linjen?" confirmLabel="Ja, slett" />
                </form>
              </div>
            </div>
          ))}
        </div>

        <form
          action={(fd) =>
            startLine(async () => {
              setLineMsg(null);
              const res = await addManualLine(fd);
              setLineMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Lagt til ✓" });
            })
          }
          className="mt-4 flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">Beskrivelse</span>
            <Input name="label" placeholder="F.eks. tilbakebetaling lån" className="w-56" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">Beløp (kr)</span>
            <Input name="amountNok" type="number" step="1" placeholder="-2000" className="w-32 text-right" />
          </label>
          <Button type="submit" variant="subtle" disabled={addingLine} className="px-4 py-2 text-sm">
            {addingLine ? "Lagrer…" : "Legg inn inntekt/trekk"}
          </Button>
          {lineMsg && (
            <span className={lineMsg.ok ? "text-sm text-accent-soft" : "text-sm text-danger"}>
              {lineMsg.text}
            </span>
          )}
        </form>
      </Card>
    </div>
  );
}
