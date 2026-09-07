"use client";

import { useState, useTransition } from "react";
import type { Campaign } from "@/lib/ops-queries";
import { createCampaign, deleteCampaign } from "@/app/admin/kampanjer/actions";

const inputCls =
  "border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft";

function fmt(iso: string | null) {
  if (!iso) return "Ikke planlagt";
  const d = new Date(iso);
  return d.toLocaleString("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CampaignManager({ campaigns }: { campaigns: Campaign[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{campaigns.length} kampanjer</p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {open ? "Lukk" : "+ Ny kampanje"}
        </button>
      </div>

      {open && (
        <form
          action={async (fd) => {
            await createCampaign(fd);
            setOpen(false);
          }}
          className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-2"
        >
          <input name="name" placeholder="Kampanjenavn" required className={inputCls} />
          <select name="channel" required className={inputCls} defaultValue="sms">
            <option value="sms">SMS</option>
            <option value="email">E-post</option>
          </select>
          <label className="text-xs text-muted sm:col-span-2">
            Planlagt tidspunkt (valgfritt)
            <input name="scheduled_at" type="datetime-local" className={`mt-1 block w-full ${inputCls}`} />
          </label>
          <textarea
            name="body"
            placeholder="Melding …"
            rows={3}
            className={`${inputCls} sm:col-span-2`}
          />
          <button
            type="submit"
            className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover sm:col-span-2"
          >
            Lagre kampanje
          </button>
        </form>
      )}

      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Navn</th>
              <th className="px-4 py-3">Kanal</th>
              <th className="px-4 py-3">Planlagt</th>
              <th className="px-4 py-3">Melding</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Ingen kampanjer enda.
                </td>
              </tr>
            )}
            {campaigns.map((c) => (
              <tr key={c.id} className="border-t border-line align-top">
                <td className="px-4 py-3 font-medium text-fg">{c.name}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-accent-soft/15 px-2.5 py-0.5 text-xs font-semibold text-accent-soft uppercase">
                    {c.channel}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{fmt(c.scheduled_at)}</td>
                <td className="max-w-xs px-4 py-3 text-muted">
                  <span className="line-clamp-2">{c.body ?? "—"}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => start(() => deleteCampaign(c.id))}
                    disabled={pending}
                    className="text-xs text-danger hover:underline"
                  >
                    Slett
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
