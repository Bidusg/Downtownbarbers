"use client";

import { useState, useTransition } from "react";
import { setCrisisStatus } from "@/app/kasse/krisetimer/actions";
import type { CrisisRequestRow } from "@/lib/crisis-queries";

const DAY: Record<string, string> = { i_dag: "I dag", i_morgen: "I morgen" };
const TIME: Record<string, string> = {
  nar_som_helst: "når som helst",
  formiddag: "formiddag",
  ettermiddag: "ettermiddag",
  kveld: "kveld",
};
const STATUS: Record<CrisisRequestRow["status"], string> = {
  ny: "Ny",
  ringt: "Ringt",
  booket: "Booket",
  avvist: "Avvist",
};

function when(iso: string) {
  try {
    return new Date(iso).toLocaleString("nb-NO", {
      timeZone: "Europe/Oslo",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function CrisisInbox({ rows }: { rows: CrisisRequestRow[] }) {
  const [list, setList] = useState(rows);
  const [pending, start] = useTransition();

  function set(r: CrisisRequestRow, status: CrisisRequestRow["status"]) {
    const prev = r.status;
    setList((l) => l.map((x) => (x.id === r.id ? { ...x, status } : x)));
    start(async () => {
      const res = await setCrisisStatus(r.id, status);
      if (res.error) setList((l) => l.map((x) => (x.id === r.id ? { ...x, status: prev } : x)));
    });
  }

  if (list.length === 0) {
    return (
      <p className="bo-card border border-line bg-surface px-5 py-10 text-center text-sm text-muted">
        Ingen krisetime-forespørsler de siste 14 dagene.
      </p>
    );
  }

  const btn =
    "rounded-lg border border-line-2 px-3 py-1.5 text-sm font-semibold text-fg hover:border-accent-soft disabled:opacity-50 [@media(pointer:coarse)]:min-h-11";

  return (
    <div className="space-y-3">
      {list.map((r) => {
        const open = r.status === "ny" || r.status === "ringt";
        return (
          <article
            key={r.id}
            className={"bo-card border bg-surface p-5 " + (open ? "border-accent-soft/60" : "border-line opacity-75")}
          >
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-fg">
                  {r.name ?? "Kunde"}
                  {r.tier && (
                    <span className="ml-2 rounded-full bg-accent-soft/15 px-2 py-0.5 text-xs font-semibold text-accent-soft">
                      {r.tier}
                    </span>
                  )}
                </h3>
                <p className="mt-0.5 text-sm text-fg">
                  {DAY[r.wish_day ?? ""] ?? "I dag"}, {TIME[r.wish_time ?? ""] ?? "når som helst"}
                  {r.service ? ` · ${r.service}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Sendt {when(r.created_at)} · {STATUS[r.status]}
                </p>
              </div>
              {r.phone && (
                <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="act act-accent">
                  Ring {r.phone}
                </a>
              )}
            </header>
            {r.note && <p className="mt-3 whitespace-pre-wrap break-words text-[15px] text-fg">«{r.note}»</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {r.status === "ny" && (
                <button type="button" className={btn} disabled={pending} onClick={() => set(r, "ringt")}>
                  Har ringt
                </button>
              )}
              {open && (
                <>
                  <button type="button" className={btn} disabled={pending} onClick={() => set(r, "booket")}>
                    Booket inn
                  </button>
                  <button type="button" className={btn} disabled={pending} onClick={() => set(r, "avvist")}>
                    Fant ingen tid
                  </button>
                </>
              )}
              {!open && (
                <button type="button" className={btn} disabled={pending} onClick={() => set(r, "ny")}>
                  Åpne igjen
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
