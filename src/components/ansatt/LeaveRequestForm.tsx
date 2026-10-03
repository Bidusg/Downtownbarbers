"use client";

import { useRef, useState, useTransition } from "react";
import { submitLeaveRequest } from "@/app/ansatt/fravaer/actions";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function LeaveRequestForm() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Trenger du fri? Send en søknad – admin behandler den.
        </p>
        <Button
          onClick={() => {
            setOpen((o) => !o);
            setMsg(null);
          }}
          className="px-4 py-2 text-sm"
        >
          {open ? "Lukk" : "+ Søk fri"}
        </Button>
      </div>

      {open && (
        <Card>
          <form
            ref={formRef}
            action={(fd) =>
              start(async () => {
                const res = await submitLeaveRequest(fd);
                if (res.ok) {
                  setMsg({ ok: true, text: "Søknaden er sendt til admin." });
                  setOpen(false);
                  formRef.current?.reset();
                } else {
                  setMsg({ ok: false, text: res.error });
                }
              })
            }
            className="grid gap-3 sm:grid-cols-2"
          >
            <Field label="Fra">
              <Input name="from_date" type="date" required />
            </Field>
            <Field label="Til">
              <Input name="to_date" type="date" required />
            </Field>

            <Field label="Type">
              <Select name="kind" defaultValue="ferie">
                <option value="ferie">Ferie</option>
                <option value="avspasering">Avspasering</option>
                <option value="annet">Annet</option>
              </Select>
            </Field>

            <Input
              name="note"
              placeholder="Kommentar (valgfritt)"
              className="sm:col-span-2"
            />

            <Button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm sm:col-span-2"
            >
              {pending ? "Sender …" : "Send søknad"}
            </Button>
          </form>
        </Card>
      )}

      {msg && (
        <p
          className={
            "text-sm " + (msg.ok ? "text-accent-soft" : "text-danger")
          }
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
