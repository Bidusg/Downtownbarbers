"use client";

import { useRef, useState, useTransition } from "react";
import { uploadStaffDocument } from "@/app/admin/ansattdokumenter/actions";

/**
 * Admin-opplasting av dokument for én valgt ansatt. Kun kategoriene
 * «kontrakt» og «annet» – lønnslipper genereres av revisor og lastes ikke opp her.
 */
export function StaffDocUploader({ staffId }: { staffId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setMsg(null);
        start(async () => {
          const r = await uploadStaffDocument(fd);
          if (r.error) {
            setMsg({ ok: false, text: r.error });
          } else {
            setMsg({ ok: true, text: "Dokumentet ble lastet opp." });
            formRef.current?.reset();
          }
        });
      }}
      className="space-y-4 border border-line bg-surface p-6"
    >
      <input type="hidden" name="staff_id" value={staffId} />
      <h2 className="font-display text-lg font-bold">Last opp dokument</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted">Kategori</label>
          <select
            name="category"
            defaultValue="kontrakt"
            required
            className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent-soft"
          >
            <option value="kontrakt">Kontrakt</option>
            <option value="annet">Annet</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Fil</label>
          <input
            type="file"
            name="file"
            required
            className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg file:mr-3 file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-fg"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "Laster opp…" : "Last opp"}
        </button>
        <span className="text-xs text-muted">
          Lagres privat. Maks 4 MB. Lønnslipp genereres av revisor.
        </span>
      </div>

      {msg && (
        <p className={"text-sm " + (msg.ok ? "text-accent-soft" : "text-danger")}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
