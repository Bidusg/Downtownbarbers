"use client";

import { useState, useTransition } from "react";
import type { Absence, StaffOption } from "@/lib/ops-queries";
import { ABSENCE_KINDS } from "@/lib/absence-kinds";
import { createAbsence, deleteAbsence, updateAbsenceKind } from "@/app/admin/fravaer/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Card } from "@/components/ui/Card";
import {
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmpty,
} from "@/components/ui/Table";
import { Input, Select, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

function no(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function AbsenceManager({
  absences,
  staff,
}: {
  absences: Absence[];
  staff: StaffOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{absences.length} registrerte fravær</p>
        <Button
          variant="primary"
          onClick={() => setOpen((o) => !o)}
          className="px-4 py-2 text-sm"
        >
          {open ? "Lukk" : "+ Nytt fravær"}
        </Button>
      </div>

      {open && (
        <Card>
          <form
            action={async (fd) => {
              await createAbsence(fd);
              setOpen(false);
            }}
            className="grid gap-3 sm:grid-cols-2"
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
            <Select name="kind" required defaultValue="">
              <option value="" disabled>
                Type fravær …
              </option>
              {ABSENCE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                  {k.deduct ? " – trekkes i lønn" : ""}
                </option>
              ))}
            </Select>
            <Input name="reason" placeholder="Kommentar (valgfritt)" className="sm:col-span-2" />
            <Field label="Fra dato">
              <Input name="from_date" type="date" required />
            </Field>
            <Field label="Til dato">
              <Input name="to_date" type="date" required />
            </Field>
            <Button type="submit" variant="primary" className="px-4 py-2 text-sm sm:col-span-2">
              Lagre fravær
            </Button>
          </form>
        </Card>
      )}

      {err && <p className="text-sm text-danger">{err}</p>}
      <p className="text-xs text-muted">
        Ulønnet permisjon og ugyldig fravær trekkes i grunnlønnen (grunnlønn ÷ arbeidsdager i
        måneden × fraværsdager). Sykdom, ferie og annet trekkes ikke.
      </p>
      <Card padded={false}>
        <Table>
          <THead>
            <Tr head>
              <Th>Ansatt</Th>
              <Th>Fra</Th>
              <Th>Til</Th>
              <Th>Type</Th>
              <Th>Kommentar</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {absences.length === 0 && (
              <TableEmpty colSpan={6}>Ingen fravær registrert enda.</TableEmpty>
            )}
            {absences.map((a) => (
              <Tr key={a.id}>
                <Td className="font-medium text-fg">{a.staffName}</Td>
                <Td muted>{no(a.from_date)}</Td>
                <Td muted>{no(a.to_date)}</Td>
                <Td>
                  <select
                    value={a.kind}
                    disabled={pending}
                    onChange={(e) => {
                      const v = e.target.value;
                      start(async () => {
                        setErr(null);
                        const res = await updateAbsenceKind(a.id, v);
                        if (res.error) setErr(res.error);
                      });
                    }}
                    className={
                      "rounded-md border bg-canvas px-2 py-1 text-xs " +
                      (ABSENCE_KINDS.find((k) => k.value === a.kind)?.deduct
                        ? "border-danger/50 text-danger"
                        : "border-line-2 text-fg")
                    }
                  >
                    {ABSENCE_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </Td>
                <Td muted>{a.reason ?? "—"}</Td>
                <Td align="right">
                  <ConfirmButton
                    label="Slett"
                    confirmLabel="Ja, slett"
                    pendingLabel="Sletter …"
                    disabled={pending}
                    onConfirm={() => deleteAbsence(a.id)}
                  />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
