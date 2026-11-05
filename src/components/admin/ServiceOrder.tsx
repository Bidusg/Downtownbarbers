"use client";

import { useMemo, useState, useTransition } from "react";
import { saveServiceOrder } from "@/app/admin/tjenester/actions";
import type { AdminService, Category } from "@/lib/admin-queries";

type Group = { id: string | null; name: string; services: AdminService[] };

/**
 * Rekkefølgen tjenestene vises i – i booking, på forsiden og i kassa.
 * Flytt kategoriene og tjenestene innen hver kategori med pilene, og lagre.
 * Øverst = vises først. Samme mønster som rekkefølgen på barberne.
 */
export function ServiceOrder({
  services,
  categories,
}: {
  services: AdminService[];
  categories: Category[];
}) {
  const initial = useMemo<Group[]>(() => {
    const groups: Group[] = categories.map((c) => ({
      id: c.id,
      name: c.name,
      services: services.filter((s) => s.category_id === c.id),
    }));
    const loose = services.filter(
      (s) => !s.category_id || !categories.some((c) => c.id === s.category_id),
    );
    if (loose.length) groups.push({ id: null, name: "Uten kategori", services: loose });
    return groups.filter((g) => g.services.length > 0);
  }, [services, categories]);

  const [groups, setGroups] = useState<Group[]>(initial);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function changed(next: Group[]) {
    setGroups(next);
    setDirty(true);
    setMsg(null);
  }

  function moveGroup(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= groups.length) return;
    const next = groups.slice();
    [next[i], next[j]] = [next[j], next[i]];
    changed(next);
  }

  function moveService(gi: number, i: number, d: -1 | 1) {
    const list = groups[gi].services;
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const nextList = list.slice();
    [nextList[i], nextList[j]] = [nextList[j], nextList[i]];
    const next = groups.slice();
    next[gi] = { ...groups[gi], services: nextList };
    changed(next);
  }

  function save() {
    start(async () => {
      const r = await saveServiceOrder(
        groups.map((g) => g.id).filter((x): x is string => !!x),
        groups.flatMap((g) => g.services.map((s) => s.id)),
      );
      if (r.ok) {
        setDirty(false);
        setMsg({ ok: true, text: "Lagret – booking, forsiden og kassa viser nå denne rekkefølgen." });
      } else {
        setMsg({ ok: false, text: r.error ?? "Kunne ikke lagre." });
      }
    });
  }

  function reset() {
    setGroups(initial);
    setDirty(false);
    setMsg(null);
  }

  const btn =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-line-2 text-fg hover:border-accent-soft disabled:opacity-30 disabled:cursor-not-allowed [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";

  return (
    <div className="bo-card mb-6 border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="min-w-0 text-left"
        >
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">
            Rekkefølge på tjenester <span className="text-muted" aria-hidden>{open ? "▾" : "▸"}</span>
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Øverst vises først i booking, på forsiden og i kassa. Flytt kategorier og tjenester med pilene.
          </p>
        </button>
        {open && (
          <div className="flex items-center gap-2">
            {dirty && (
              <button
                type="button"
                onClick={reset}
                disabled={pending}
                className="rounded-lg border border-line-2 px-3 py-2 text-sm text-muted hover:text-fg"
              >
                Angre
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={!dirty || pending}
              className="bo-btn inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Lagrer …" : "Lagre rekkefølge"}
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="border-t border-line">
          {groups.map((g, gi) => (
            <section key={g.id ?? "none"} className="border-b border-line last:border-0">
              <div className="flex items-center gap-3 bg-surface-2/60 px-5 py-2">
                <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-muted">
                  {g.name}
                </span>
                {g.id && (
                  <>
                    <button
                      type="button"
                      className={btn}
                      onClick={() => moveGroup(gi, -1)}
                      disabled={gi === 0}
                      aria-label={`Flytt kategorien ${g.name} opp`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={btn}
                      onClick={() => moveGroup(gi, 1)}
                      disabled={gi === groups.length - 1 || !groups[gi + 1]?.id}
                      aria-label={`Flytt kategorien ${g.name} ned`}
                    >
                      ↓
                    </button>
                  </>
                )}
              </div>
              <ol className="divide-y divide-line">
                {g.services.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="w-5 text-right text-sm tabular-nums text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{s.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {s.price_nok.toLocaleString("nb-NO")} kr · {s.duration_min} min
                        {!s.active ? " · inaktiv" : !s.online_bookable ? " · ikke på nett" : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={btn}
                      onClick={() => moveService(gi, i, -1)}
                      disabled={i === 0}
                      aria-label={`Flytt ${s.name} opp`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={btn}
                      onClick={() => moveService(gi, i, 1)}
                      disabled={i === g.services.length - 1}
                      aria-label={`Flytt ${s.name} ned`}
                    >
                      ↓
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {msg && (
        <p role="status" className={"border-t border-line px-5 py-3 text-sm " + (msg.ok ? "text-fg" : "text-danger")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
