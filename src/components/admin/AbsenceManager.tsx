"use client";

import { useState, useTransition } from "react";
import type { Absence, StaffOption } from "@/lib/ops-queries";
import { createAbsence, deleteAbsence } from "@/app/admin/fravaer/actions";
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
  const [pending] = useTransition();

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
            <Input name="reason" placeholder="Årsak (valgfritt)" />
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

      <Card padded={false}>
        <Table>
          <THead>
            <Tr head>
              <Th>Ansatt</Th>
              <Th>Fra</Th>
              <Th>Til</Th>
              <Th>Årsak</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {absences.length === 0 && (
              <TableEmpty colSpan={5}>Ingen fravær registrert enda.</TableEmpty>
            )}
            {absences.map((a) => (
              <Tr key={a.id}>
                <Td className="font-medium text-fg">{a.staffName}</Td>
                <Td muted>{no(a.from_date)}</Td>
                <Td muted>{no(a.to_date)}</Td>
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
