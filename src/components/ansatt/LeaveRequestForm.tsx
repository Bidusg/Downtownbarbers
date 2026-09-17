"use client";

import { useRef, useState, useTransition } from "react";
import { submitLeaveRequest } from "@/app/ansatt/fravaer/actions";

const inputCls =
  "border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft";

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
        <button
          onClick={() => {
            setOpen((o) => !o);
            setMsg(null);
          }}
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {open ? "Lukk" : "+ Søk fri"}
        </button>
      </div>

      {open && (
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
          className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-2"
        >
          <label className="text-xs text-muted">
            Fra
            <input
              name="from_date"
              type="date"
              required
              className={`mt-1 block w-full ${inputCls}`}
            />
          </label>
          <label className="text-xs text-muted">
            Til
            <input
              name="to_date"
              type="date"
              required
              className={`mt-1 block w-full ${inputCls}`}
            />
          </label>

          <label className="text-xs text-muted">
            Type
            <select
              name="kind"
              defaultValue="ferie"
              className={`mt-1 block w-full ${inputCls}`}
            >
              <option value="ferie">Ferie</option>
              <option value="avspasering">Avspasering</option>
              <option value="annet">Annet</option>
            </select>
          </label>

          <input
            name="note"
            placeholder="Kommentar (valgfritt)"
            className={`${inputCls} sm:col-span-2`}
          />

          <button
            type="submit"
            disabled={pending}
            className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-40 sm:col-span-2"
          >
            {pending ? "Sender …" : "Send søknad"}
          </button>
        </form>
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
