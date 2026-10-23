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

/** Én innstilling: navn (evt. med av/på) til venstre, felt til høyre. */
function Row({
  label,
  toggle,
  sub,
  children,
}: {
  label: React.ReactNode;
  /** Av/på-bryter foran navnet (tillegg som kan slås av). */
  toggle?: { checked: boolean; onChange: (v: boolean) => void };
  /** Ekstra linje under navnet (f.eks. «fra kl. 19:00»). */
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3">
      <div className="min-w-0">
        {toggle ? (
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-fg">
            <input
              type="checkbox"
              checked={toggle.checked}
              onChange={(e) => toggle.onChange(e.target.checked)}
              className="h-4 w-4 shrink-0 accent-[#F47721]"
            />
            <span className="truncate">{label}</span>
          </label>
        ) : (
          <span className="block truncate text-sm font-medium text-fg">{label}</span>
        )}
        {sub && <div className={"mt-1 text-xs text-muted " + (toggle ? "pl-[26px]" : "")}>{sub}</div>}
      </div>
      <div className="flex items-center justify-end">{children}</div>
    </div>
  );
}

/** Kompakt tallfelt med enhet inni feltet (kr, %, kr/t). */
function NumBox({
  value,
  onChange,
  step = "1",
  suffix,
  disabled = false,
  wide = false,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: string;
  suffix?: string;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <span className={"relative inline-flex " + (disabled ? "opacity-45" : "")}>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        disabled={disabled}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className={
          (wide ? "w-32" : "w-28") +
          " h-10 rounded-[10px] border border-line-2 bg-canvas pr-11 pl-3 text-right text-sm text-fg tabular-nums outline-none transition-colors focus:border-accent-soft disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        }
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">
          {suffix}
        </span>
      )}
    </span>
  );
}

/** Klokkeslett som 24-timers nedtrekk (unngår «07:00 PM» fra nettleseren). */
const TIMES = Array.from({ length: 29 }, (_, i) => {
  const m = 8 * 60 + i * 30; // 08:00–22:00
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
function TimeSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const v = (value || "").slice(0, 5);
  const opts = TIMES.includes(v) || !v ? TIMES : [v, ...TIMES];
  return (
    <span className="inline-flex items-center gap-1.5">
      fra kl.
      <select
        value={v}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded-md border border-line-2 bg-canvas px-1.5 text-xs text-fg tabular-nums disabled:opacity-45"
      >
        {opts.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
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
            <Row label="Fastlønn per måned">
              <NumBox
                value={s.baseSalaryOverrideNok ?? context.staffBaseSalaryNok}
                onChange={(v) => set("baseSalaryOverrideNok", v)}
                suffix="kr"
                wide
              />
            </Row>
            <Row label="Feriebonus" toggle={{ checked: s.enableHolidayBonus, onChange: (v) => set("enableHolidayBonus", v) }}>
              <NumBox value={s.holidayBonusNok} onChange={(v) => set("holidayBonusNok", v)} suffix="kr" disabled={!s.enableHolidayBonus} />
            </Row>
            <Row label="Ferielønn" toggle={{ checked: s.enableVacationPay, onChange: (v) => set("enableVacationPay", v) }}>
              <NumBox value={s.vacationPayRate * 100} onChange={(v) => set("vacationPayRate", v / 100)} step="0.1" suffix="%" disabled={!s.enableVacationPay} />
            </Row>
            <Row label="Sykefravær" toggle={{ checked: s.enableSickPay, onChange: (v) => set("enableSickPay", v) }}>
              <NumBox value={s.sickRateNok} onChange={(v) => set("sickRateNok", v)} suffix="kr/t" disabled={!s.enableSickPay} />
            </Row>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Fastlønn hentes fra ansattkortet. Feriebonus, ferielønn og sykefravær er
            forenklet – se merknad i rapporten.
          </p>
        </Card>

        {/* 2) Bonus / tillegg */}
        <Card title="Tillegg">
          <div className="divide-y divide-line">
            <Row
              label="Kveldstillegg"
              toggle={{ checked: s.enableEvening, onChange: (v) => set("enableEvening", v) }}
              sub={<TimeSelect value={s.eveningFrom} onChange={(v) => set("eveningFrom", v)} disabled={!s.enableEvening} />}
            >
              <NumBox value={s.eveningRateNok} onChange={(v) => set("eveningRateNok", v)} suffix="kr/t" disabled={!s.enableEvening} />
            </Row>
            <Row
              label="Lørdagstillegg"
              toggle={{ checked: s.enableSaturday, onChange: (v) => set("enableSaturday", v) }}
              sub={<TimeSelect value={s.saturdayFrom} onChange={(v) => set("saturdayFrom", v)} disabled={!s.enableSaturday} />}
            >
              <NumBox value={s.saturdayRateNok} onChange={(v) => set("saturdayRateNok", v)} suffix="kr/t" disabled={!s.enableSaturday} />
            </Row>
            <Row label="Søndagstillegg" toggle={{ checked: s.enableSunday, onChange: (v) => set("enableSunday", v) }}>
              <NumBox value={s.sundayRateNok} onChange={(v) => set("sundayRateNok", v)} suffix="kr/t" disabled={!s.enableSunday} />
            </Row>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Antall timer per tillegg føres under «Timer for perioden». Overtid og
            helligdager føres som manuelle linjer.
          </p>
        </Card>

        {/* 3) Provisjon */}
        <Card title="Provisjon">
          <div className="divide-y divide-line">
            <Row label="Modell">
              <select
                value={s.commissionModel}
                onChange={(e) => set("commissionModel", e.target.value as "terskel" | "split")}
                className="h-10 w-40 rounded-[10px] border border-line-2 bg-canvas px-2.5 text-sm text-fg"
              >
                <option value="terskel">Terskel (dagens)</option>
                <option value="split">Tjeneste/vare</option>
              </select>
            </Row>
            {s.commissionModel === "terskel" ? (
              <>
                <Row label="Provisjonssats">
                  <NumBox value={s.commissionRate * 100} onChange={(v) => set("commissionRate", v / 100)} step="1" suffix="%" />
                </Row>
                <Row label="Terskel">
                  <NumBox value={s.commissionThresholdNok} onChange={(v) => set("commissionThresholdNok", v)} suffix="kr" wide />
                </Row>
              </>
            ) : (
              <>
                <Row label="Tjenester">
                  <NumBox value={s.serviceRate * 100} onChange={(v) => set("serviceRate", v / 100)} step="1" suffix="%" />
                </Row>
                <Row label="Produktsalg">
                  <NumBox value={s.productRate * 100} onChange={(v) => set("productRate", v / 100)} step="1" suffix="%" />
                </Row>
                <Row label="Markedsplass" toggle={{ checked: s.enableMarketplace, onChange: (v) => set("enableMarketplace", v) }}>
                  <NumBox value={s.marketplaceRate * 100} onChange={(v) => set("marketplaceRate", v / 100)} step="1" suffix="%" disabled={!s.enableMarketplace} />
                </Row>
              </>
            )}
            <Row label="Beregn uten mva" toggle={{ checked: s.commissionExVat, onChange: (v) => set("commissionExVat", v) }} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted tabular-nums">
            Omsetning {monthLabel}: {kr2(context.grossInclVatNok)} inkl. mva ·{" "}
            {kr2(netExVat)} eks. mva.
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={saveSettings} disabled={savingSettings} className="px-5 py-2.5 text-sm font-semibold">
          {savingSettings ? "Lagrer…" : "Lagre innstillinger"}
        </Button>
        {settingsMsg && (
          <span role="status" className={settingsMsg.ok ? "text-sm text-accent-soft" : "text-sm text-danger"}>
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
