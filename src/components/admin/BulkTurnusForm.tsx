"use client";

import { useState, useTransition } from "react";
import type { StaffOption } from "@/lib/ops-queries";
import { bulkSetStaffHours } from "@/app/admin/timelister/actions";
import { parityLabel, parityOptions } from "@/lib/turnus";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

// Man → Søn (0 = søndag i databasen).
const DAYS: { dow: number; label: string }[] = [
  { dow: 1, label: "Man" },
  { dow: 2, label: "Tir" },
  { dow: 3, label: "Ons" },
  { dow: 4, label: "Tor" },
  { dow: 5, label: "Fre" },
  { dow: 6, label: "Lør" },
  { dow: 0, label: "Søn" },
];

export function BulkTurnusForm({
  staff,
  weeks = 2,
}: {
  staff: StaffOption[];
  weeks?: number;
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();
  // Arbeidstid + pause (styrt, så pausen kan forhåndsutfylles og oppsummeres).
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("17:00");
  const [withPause, setWithPause] = useState(false);
  const [pStart, setPStart] = useState("13:00");
  const [pLen, setPLen] = useState(30);
  const addMin = (hhmm: string, min: number) => {
    const [h, m] = hhmm.split(":").map(Number);
    const t = Math.min(23 * 60 + 59, h * 60 + m + min);
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  };
  const pEnd = addMin(pStart, pLen);
  const pauseOk = !withPause || (pStart >= from && pEnd <= to && pEnd > pStart);

  const step = (n: number, title: string) => (
    <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-fg uppercase">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft/15 text-[11px] text-accent-soft">
        {n}
      </span>
      {title}
    </p>
  );

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-fg">Bulk-turnus</h3>
          <p className="text-xs text-muted">
            Sett arbeidstid og fast pause for flere dager på én gang (f.eks. man–fre 10–19, pause 13–13:30).
          </p>
        </div>
        <Button
          variant="subtle"
          onClick={() => {
            setOpen((o) => !o);
            setMsg(null);
          }}
          className="rounded-md px-3 py-1.5 text-xs"
        >
          {open ? "Lukk" : "Sett turnus"}
        </Button>
      </div>

      {open && (
        <form
          action={(fd) =>
            start(async () => {
              setMsg(null);
              setErr(false);
              const r = await bulkSetStaffHours(fd);
              if (r.error) {
                setErr(true);
                setMsg(r.error);
              } else {
                setMsg("Turnus lagret ✓");
              }
            })
          }
          className="mt-4 space-y-5"
        >
          <div>
          {step(1, "Hvem og hvilken uke")}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Ansatt
              <Select name="staff_id" required defaultValue="">
                <option value="" disabled>
                  Velg ansatt …
                </option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Uke
              <Select name="week_parity" defaultValue="0">
                <option value="0">Hver uke</option>
                {weeks > 1 &&
                  parityOptions(weeks).map((i) => (
                    <option key={i} value={i}>
                      Kun {parityLabel(i).toLowerCase()}
                    </option>
                  ))}
              </Select>
            </label>
          </div>
          </div>

          <div>
            {step(2, "Dager")}
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => (
                <label
                  key={d.dow}
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border border-line-2 px-3 py-1.5 text-sm text-fg has-[:checked]:border-accent-soft has-[:checked]:bg-accent-soft/10"
                >
                  <input
                    type="checkbox"
                    name={`d${d.dow}`}
                    defaultChecked={d.dow >= 1 && d.dow <= 5}
                    className="accent-accent"
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            {step(3, "Arbeidstid")}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Fra
                <Input type="time" name="start_time" value={from} onChange={(e) => setFrom(e.target.value)} required />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Til
                <Input type="time" name="end_time" value={to} onChange={(e) => setTo(e.target.value)} required />
              </label>
            </div>
          </div>

          {/* Fast pause – eget, tydelig steg */}
          <div className="rounded-lg border border-line bg-surface-2 p-3">
            {step(4, "Fast pause (valgfritt)")}
            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={withPause}
                onChange={(e) => setWithPause(e.target.checked)}
                className="accent-accent"
              />
              Legg inn fast pause hver av disse dagene
            </label>
            {withPause && (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Pausen starter
                  <Input type="time" value={pStart} onChange={(e) => setPStart(e.target.value)} />
                </label>
                <div className="flex flex-col gap-1 text-xs text-muted">
                  Lengde
                  <div className="flex gap-1.5">
                    {[15, 30, 45, 60].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPLen(m)}
                        className={"act " + (pLen === m ? "act-accent ring-1 ring-accent-soft" : "")}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                </div>
                <p className="pb-2 text-sm text-fg">
                  Pause <span className="font-semibold">{pStart}–{pEnd}</span>
                </p>
                <input type="hidden" name="pause_start" value={pStart} />
                <input type="hidden" name="pause_end" value={pEnd} />
              </div>
            )}
            {withPause && !pauseOk && (
              <p className="mt-2 text-xs text-danger">Pausen må ligge innenfor arbeidstiden ({from}–{to}).</p>
            )}
          </div>

          <div>
            {step(5, "Når gjelder den")}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Gjelder fra (valgfritt)
                <Input type="date" name="valid_from" />
              </label>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" name="replace" className="accent-accent" />
                Erstatt eksisterende for valgte dager
              </label>
            </div>
            <p className="mt-2 text-xs text-muted">
              Tom dato = gjelder med en gang. Med dato starter turnusen den dagen – kunder kan
              booke fra da av. Kryss av «Erstatt» for å la den gamle turnusen gå frem til dagen før.
            </p>
          </div>

          <p className="rounded-md bg-accent-soft/10 px-3 py-2 text-sm text-fg">
            Lagres som: <span className="font-semibold">{from}–{to}</span>
            {withPause && (
              <>
                {" "}med pause <span className="font-semibold">{pStart}–{pEnd}</span>
              </>
            )}
          </p>

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={pending || !pauseOk}
              className="px-4 py-2 text-sm"
            >
              {pending ? "Lagrer …" : "Lagre turnus"}
            </Button>
            {msg && (
              <span className={"text-sm " + (err ? "text-danger" : "text-muted")}>
                {msg}
              </span>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}
