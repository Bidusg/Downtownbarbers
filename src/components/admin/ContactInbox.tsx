"use client";

import { useState, useTransition } from "react";
import { setContactStatus } from "@/app/admin/henvendelser/actions";
import type { ContactMessage } from "@/lib/contact-queries";

const TOPIC: Record<string, string> = {
  sporsmal: "Spørsmål",
  gavekort: "Gavekort",
  bedrift: "Bedrift og grupper",
  tilbakemelding: "Ros eller ris",
  annet: "Annet",
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

export function ContactInbox({ rows }: { rows: ContactMessage[] }) {
  const [list, setList] = useState(rows);
  const [tab, setTab] = useState<"ny" | "alle">("ny");
  const [pending, start] = useTransition();

  const shown = tab === "ny" ? list.filter((m) => m.status === "ny") : list;
  const nNew = list.filter((m) => m.status === "ny").length;

  function toggle(m: ContactMessage) {
    const next = m.status === "ny" ? "behandlet" : "ny";
    setList((l) => l.map((x) => (x.id === m.id ? { ...x, status: next } : x)));
    start(async () => {
      const r = await setContactStatus(m.id, next);
      if (r.error) setList((l) => l.map((x) => (x.id === m.id ? { ...x, status: m.status } : x)));
    });
  }

  const tabCls = (on: boolean) =>
    "rounded-lg px-3 py-1.5 text-sm font-medium " + (on ? "bg-fg text-canvas" : "text-muted hover:text-fg");

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        <button type="button" className={tabCls(tab === "ny")} onClick={() => setTab("ny")}>
          Nye ({nNew})
        </button>
        <button type="button" className={tabCls(tab === "alle")} onClick={() => setTab("alle")}>
          Alle ({list.length})
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="bo-card border border-line bg-surface px-5 py-10 text-center text-sm text-muted">
          {tab === "ny" ? "Ingen nye henvendelser." : "Ingen henvendelser ennå."}
        </p>
      ) : (
        shown.map((m) => (
          <article
            key={m.id}
            className={"bo-card border bg-surface p-5 " + (m.status === "ny" ? "border-accent-soft/60" : "border-line opacity-80")}
          >
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-fg">
                  {m.name}
                  {m.callback && (
                    <span className="ml-2 rounded-full bg-accent-soft/15 px-2 py-0.5 text-xs font-semibold text-accent-soft">
                      Vil bli ringt
                    </span>
                  )}
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  {TOPIC[m.topic] ?? m.topic} · {when(m.created_at)}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => toggle(m)}
                className="rounded-lg border border-line-2 px-3 py-1.5 text-sm font-semibold text-fg hover:border-accent-soft disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
              >
                {m.status === "ny" ? "Marker som behandlet" : "Merk som ny"}
              </button>
            </header>
            <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-fg">{m.message}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              {m.phone && (
                <a href={`tel:${m.phone.replace(/[^\d+]/g, "")}`} className="act">
                  Ring {m.phone}
                </a>
              )}
              {m.email && (
                <a
                  href={`mailto:${m.email}?subject=${encodeURIComponent("Svar fra Downtown Barbers")}`}
                  className="act act-accent"
                >
                  Svar på e-post
                </a>
              )}
            </div>
          </article>
        ))
      )}
    </div>
  );
}
