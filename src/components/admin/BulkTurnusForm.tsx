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

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-fg">Bulk-turnus</h3>
          <p className="text-xs text-muted">
            Sett arbeidstid for flere dager på én gang (f.eks. man–fre 09–17).
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
          {open ? "Lukk" : "Åpne"}
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
          className="mt-4 space-y-3"
        >
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

          <div>
            <span className="mb-1 block text-xs text-muted">Dager</span>
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

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Fra
              <Input type="time" name="start_time" defaultValue="09:00" required />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Til
              <Input type="time" name="end_time" defaultValue="17:00" required />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Gjelder fra (valgfritt)
              <Input type="date" name="valid_from" />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="replace" className="accent-accent" />
              Erstatt eksisterende for valgte dager
            </label>
          </div>
          <p className="text-xs text-muted">
            Tom dato = gjelder med en gang. Med dato starter turnusen den dagen – kunder kan
            booke fra da av. Kryss av «Erstatt» for å la den gamle turnusen gå frem til dagen før.
          </p>

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={pending}
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
