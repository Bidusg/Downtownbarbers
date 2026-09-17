"use client";

import { useRef, useState, useTransition } from "react";
import { uploadMyDocument } from "@/app/ansatt/dokumenter/actions";

export function DocumentUploadForm() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Trenger du å dele et dokument? Last opp – kun du og ledelsen ser det.
        </p>
        <button
          onClick={() => {
            setOpen((o) => !o);
            setMsg(null);
          }}
          className="shrink-0 bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {open ? "Lukk" : "+ Last opp"}
        </button>
      </div>

      {open && (
        <form
          ref={formRef}
          action={(fd) =>
            start(async () => {
              const res = await uploadMyDocument(fd);
              if (res.ok) {
                setMsg({ ok: true, text: "Dokumentet er lastet opp." });
                setOpen(false);
                formRef.current?.reset();
              } else {
                setMsg({ ok: false, text: res.error });
              }
            })
          }
          className="grid gap-3 border border-line bg-surface-2 p-5"
        >
          <label className="text-xs text-muted">
            Fil (maks 4 MB)
            <input
              name="file"
              type="file"
              required
              className="mt-1 block w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg outline-none file:mr-3 file:border-0 file:bg-accent-soft/15 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-accent-soft focus:border-accent-soft"
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-40"
          >
            {pending ? "Laster opp …" : "Last opp dokument"}
          </button>
        </form>
      )}

      {msg && (
        <p className={"text-sm " + (msg.ok ? "text-accent-soft" : "text-danger")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
