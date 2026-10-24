"use client";

import { useState, useTransition } from "react";
import { saveStaffWebOrder } from "@/app/admin/ansatte/actions";
import type { StaffWebOrderRow } from "@/lib/admin-queries";

/**
 * Rekkefølgen barberne vises i på nettsiden (booking + «Teamet»).
 * Flytt med pilene og lagre. Øverst = vises først.
 */
export function StaffWebOrder({ rows, ready }: { rows: StaffWebOrderRow[]; ready: boolean }) {
  const [list, setList] = useState(rows);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    setDirty(true);
    setMsg(null);
  }

  function save() {
    start(async () => {
      const r = await saveStaffWebOrder(list.map((x) => x.id));
      if (r.ok) {
        setDirty(false);
        setMsg({ ok: true, text: "Lagret – nettsiden viser nå denne rekkefølgen." });
      } else {
        setMsg({ ok: false, text: r.error ?? "Kunne ikke lagre." });
      }
    });
  }

  const btn =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-line-2 text-fg hover:border-accent-soft disabled:opacity-30 disabled:cursor-not-allowed [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";

  return (
    <div className="bo-card mb-6 border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Rekkefølge på nettsiden</h2>
          <p className="mt-0.5 text-xs text-muted">
            Øverst vises først i booking og under «Teamet». «Hvilken som helst» gir også timen til
            første ledige i denne rekkefølgen.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending || !ready}
          className="bo-btn inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Lagrer …" : "Lagre rekkefølge"}
        </button>
      </div>

      {!ready && (
        <p className="border-b border-line px-5 py-3 text-sm text-danger">
          Kjør KJØR-I-SUPABASE-REKKEFOLGE-BARBERE.sql i Supabase først – da kan rekkefølgen lagres.
        </p>
      )}

      <ol className="divide-y divide-line">
        {list.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 px-5 py-2.5">
            <span className="w-5 text-right text-sm tabular-nums text-muted">{i + 1}</span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-sm font-semibold text-fg/60">
              {s.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.photo} alt="" width={36} height={36} className="h-full w-full object-cover object-top" />
              ) : (
                s.name.charAt(0)
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">{s.name}</span>
              {s.title && <span className="block truncate text-xs text-muted">{s.title}</span>}
            </span>
            <button type="button" className={btn} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Flytt ${s.name} opp`}>
              ↑
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => move(i, 1)}
              disabled={i === list.length - 1}
              aria-label={`Flytt ${s.name} ned`}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>

      {msg && (
        <p role="status" className={"px-5 py-3 text-sm " + (msg.ok ? "text-fg" : "text-danger")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
