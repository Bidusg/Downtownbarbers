"use client";

import { useState, useTransition } from "react";
import type { StaffHour, StaffOption } from "@/lib/ops-queries";
import {
  createStaffHour,
  deleteStaffHour,
  updateStaffHour,
  copyTurnusWeek,
} from "@/app/admin/timelister/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { parityLabel, parityOptions } from "@/lib/turnus";

const WEEKDAYS = [
  "Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag",
];

// Mandag først i visningen (DB bruker 0 = søndag).
const ORDER = [1, 2, 3, 4, 5, 6, 0];

const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
const fmtDm = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}.${Number(m)}`;
};

export function StaffHoursManager({
  hours,
  staff,
  weeks = 2,
}: {
  hours: StaffHour[];
  staff: StaffOption[];
  weeks?: number;
}) {
  const indices = parityOptions(weeks); // [1..weeks]
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending] = useTransition();

  const byStaff = staff.map((s) => ({
    staff: s,
    rows: hours
      .filter((h) => h.staff_id === s.id)
      .sort((a, b) => ORDER.indexOf(a.weekday) - ORDER.indexOf(b.weekday)),
  }));

  const [copyMsg, setCopyMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function copy(from: number, to: number) {
    const fromL = from === 1 ? "A" : "B";
    const toL = to === 1 ? "A" : "B";
    setCopyMsg(null);
    const fd = new FormData();
    fd.set("from", String(from));
    fd.set("to", String(to));
    try {
      // copyTurnusWeek kan (avhengig av versjon) returnere { error }.
      const r = (await copyTurnusWeek(fd)) as unknown as { error?: string } | undefined;
      if (r?.error) return { ok: false, error: r.error }; // vises av ConfirmButton
      setCopyMsg({ ok: true, text: `Uke ${fromL} er kopiert til uke ${toL} ✓` });
      return { ok: true };
    } catch {
      return { ok: false, error: "Kopieringen feilet. Prøv igjen." };
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{hours.length} vakter i malen</p>
        <div className="flex flex-wrap items-center gap-2">
          {weeks === 2 && (
            <>
              <ConfirmButton
                label="Kopier A → B"
                question="Erstatte alle uke B-vakter med en kopi av uke A?"
                confirmLabel="Ja, kopier"
                pendingLabel="Kopierer …"
                className="act"
                disabled={pending}
                onConfirm={() => copy(1, 2)}
              />
              <ConfirmButton
                label="Kopier B → A"
                question="Erstatte alle uke A-vakter med en kopi av uke B?"
                confirmLabel="Ja, kopier"
                pendingLabel="Kopierer …"
                className="act"
                disabled={pending}
                onConfirm={() => copy(2, 1)}
              />
            </>
          )}
          <Button
            onClick={() => setOpen((o) => !o)}
            className="px-4 py-2 text-sm"
          >
            {open ? "Lukk" : "+ Ny vakt"}
          </Button>
        </div>
      </div>

      {copyMsg && (
        <p className={"text-sm " + (copyMsg.ok ? "text-accent-soft" : "text-danger")}>
          {copyMsg.text}
        </p>
      )}

      {open && (
        <Card>
          <form
            action={async (fd) => {
              setErr(null);
              const r = await createStaffHour(fd);
              if (r?.error) return setErr(r.error);
              setOpen(false);
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
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
            <Select name="weekday" required defaultValue="">
              <option value="" disabled>
                Ukedag …
              </option>
              {ORDER.map((w) => (
                <option key={w} value={w}>
                  {WEEKDAYS[w]}
                </option>
              ))}
            </Select>
            <Select name="week_parity" defaultValue="0">
              <option value="0">Hver uke</option>
              {weeks > 1 &&
                indices.map((i) => (
                  <option key={i} value={i}>
                    {parityLabel(i)}
                  </option>
                ))}
            </Select>
            <label className="text-xs text-muted">
              Fra
              <Input name="start_time" type="time" required className="mt-1 block w-full" defaultValue="09:00" />
            </label>
            <label className="text-xs text-muted">
              Til
              <Input name="end_time" type="time" required className="mt-1 block w-full" defaultValue="19:00" />
            </label>
            <label className="text-xs text-muted">
              Gjelder fra (valgfritt)
              <Input name="valid_from" type="date" className="mt-1 block w-full" />
            </label>
            <Button
              type="submit"
              className="px-4 py-2 text-sm sm:col-span-2 lg:col-span-4"
            >
              Legg til vakt
            </Button>
          </form>
        </Card>
      )}

      {err && (
        <p className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>
      )}
      {staff.length === 0 && (
        <EmptyState description="Ingen aktive ansatte enda – legg til ansatte først." />
      )}

      <div className="space-y-4">
        {byStaff.map(({ staff: s, rows }) => (
          <Card key={s.id} padded={false}>
            <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
              <p className="font-medium text-fg">{s.full_name}</p>
              <p className="text-xs text-muted">{s.title ?? "Barber"}</p>
            </div>
            {rows.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">
                Ingen fast arbeidstid satt.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((h) =>
                  editId === h.id ? (
                    <li key={h.id} className="px-5 py-3">
                      <form
                        action={async (fd) => {
                          setErr(null);
                          const r = await updateStaffHour(fd);
                          if (r?.error) return setErr(r.error);
                          setEditId(null);
                        }}
                        className="flex flex-wrap items-center gap-2 text-sm"
                      >
                        <input type="hidden" name="id" value={h.id} />
                        <span className="w-28 text-fg">{WEEKDAYS[h.weekday]}</span>
                        <Input
                          name="start_time"
                          type="time"
                          required
                          defaultValue={h.start_time}
                          className="w-28"
                        />
                        <span className="text-muted">–</span>
                        <Input
                          name="end_time"
                          type="time"
                          required
                          defaultValue={h.end_time}
                          className="w-28"
                        />
                        <Select
                          name="week_parity"
                          defaultValue={String(h.week_parity)}
                          className="w-28"
                        >
                          <option value="0">Hver uke</option>
                          {weeks > 1 &&
                            indices.map((i) => (
                              <option key={i} value={i}>
                                {parityLabel(i)}
                              </option>
                            ))}
                        </Select>
                        <Button
                          type="submit"
                          disabled={pending}
                          className="px-3 py-1.5 text-xs"
                        >
                          Lagre
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setEditId(null)}
                          className="px-3 py-1.5 text-xs"
                        >
                          Avbryt
                        </Button>
                      </form>
                    </li>
                  ) : (
                    <li
                      key={h.id}
                      className="flex items-center justify-between px-5 py-2.5 text-sm"
                    >
                      <span className="w-28 text-fg">{WEEKDAYS[h.weekday]}</span>
                      <span className="font-display text-muted">
                        {h.start_time}–{h.end_time}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Badge
                          tone={h.week_parity === 0 ? "neutral" : "accent"}
                          className="text-[10px] uppercase tracking-wide"
                        >
                          {parityLabel(h.week_parity)}
                        </Badge>
                        {h.valid_from && h.valid_from > todayIso && (
                          <Badge tone="accent" className="text-[10px]">Fra {fmtDm(h.valid_from)}</Badge>
                        )}
                        {h.valid_to && (
                          <Badge tone="neutral" className="text-[10px]">Til {fmtDm(h.valid_to)}</Badge>
                        )}
                      </span>
                      <div className="flex items-center gap-3">
                        <Button
                          variant="ghost"
                          onClick={() => setEditId(h.id)}
                          className="act"
                        >
                          Endre
                        </Button>
                        <ConfirmButton
                          label="Slett"
                          confirmLabel="Ja, slett"
                          pendingLabel="Sletter …"
                          disabled={pending}
                          onConfirm={() => deleteStaffHour(h.id)}
                        />
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
