"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { SendRestButton } from "@/components/admin/SendRestButton";
import type { MarketingSend } from "@/lib/dm-queries";
import {
  sendToRest,
  previewRest,
  resumeMarketing,
  archiveMarketingSends,
  unarchiveMarketingSends,
} from "@/app/admin/markedsforing/actions";

const SEG_LABEL: Record<string, string> = {
  all: "Alle med samtykke",
  gullkunder: "Gullkunder",
  inaktiv: "Inaktive",
  filter: "Filter (kundefilter)",
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("nb-NO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function pct(s: MarketingSend) {
  return Math.round(((s.recipient_count ?? 0) / Math.max(1, s.total ?? 1)) * 100);
}

/** Statuscellen – uendret oppførsel fra før (ferdig / stoppet / sender). */
function StatusCell({ s }: { s: MarketingSend }) {
  if (s.status === "done" || !s.status) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        Ferdig{s.failed ? ` · ${s.failed} feilet` : ""}
        {s.channel !== "sms" && (
          <SendRestButton
            action={sendToRest.bind(null, s.id)}
            preview={previewRest.bind(null, s.id)}
            subject={s.subject}
          />
        )}
      </span>
    );
  }
  if (s.status === "failed") {
    return (
      <form action={resumeMarketing.bind(null, s.id)}>
        <span className="text-xs text-danger">Stoppet</span>{" "}
        <button type="submit" className="act act-accent">
          Fortsett
        </button>
      </form>
    );
  }
  return (
    <span className="flex flex-col gap-1">
      <span className="inline-flex items-center gap-2 text-xs text-accent-soft">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent-soft" />
        {s.status === "queued" && (s.recipient_count ?? 0) === 0 ? "I kø – starter …" : "Sender …"}{" "}
        {pct(s)} %
      </span>
      <span className="h-1 w-28 overflow-hidden rounded-full bg-line">
        <span className="block h-full bg-accent-soft transition-[width]" style={{ width: `${pct(s)}%` }} />
      </span>
      {s.last_error && <span className="text-[11px] text-danger">{s.last_error.slice(0, 120)}</span>}
    </span>
  );
}

export function SendLogTable({
  sends,
  archived,
}: {
  sends: MarketingSend[];
  archived: MarketingSend[];
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pending, start] = useTransition();

  const allSelected = sends.length > 0 && sel.size === sends.length;

  // Hvilke rader er duplikater? Grupper på emne + segment; i hver gruppe med
  // mer enn én, beholder vi den «beste» (flest sendt, så nyeste) og merker
  // resten som overflødige.
  const duplicateIds = useMemo(() => {
    const groups = new Map<string, MarketingSend[]>();
    for (const s of sends) {
      const key = `${s.subject}\u0000${s.segment ?? ""}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    const ids = new Set<string>();
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const sorted = [...list].sort((a, b) => {
        const d = (b.recipient_count ?? 0) - (a.recipient_count ?? 0);
        if (d !== 0) return d;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      sorted.slice(1).forEach((s) => ids.add(s.id));
    }
    return ids;
  }, [sends]);

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSel(allSelected ? new Set() : new Set(sends.map((s) => s.id)));
  }
  function markDuplicates() {
    setSel(new Set(duplicateIds));
    setMsg(
      duplicateIds.size === 0
        ? "Fant ingen duplikater (ingen rader deler emne + segment)."
        : null,
    );
  }

  function doArchive() {
    const ids = [...sel];
    if (ids.length === 0) return;
    setMsg(null);
    start(async () => {
      const r = await archiveMarketingSends(ids);
      if (r.error) setMsg(r.error);
      else {
        setSel(new Set());
        router.refresh();
      }
    });
  }
  function restore(id: string) {
    start(async () => {
      const r = await unarchiveMarketingSends([id]);
      if (r.error) setMsg(r.error);
      else router.refresh();
    });
  }

  return (
    <div>
      {/* Verktøylinje */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-6 py-3 text-sm">
        <button
          type="button"
          onClick={markDuplicates}
          className="border border-line-2 px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-2"
        >
          Merk duplikater{duplicateIds.size > 0 ? ` (${duplicateIds.size})` : ""}
        </button>
        <button
          type="button"
          onClick={toggleAll}
          className="border border-line-2 px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-2"
        >
          {allSelected ? "Fjern alle" : "Velg alle"}
        </button>
        <span className="ml-auto flex items-center gap-2">
          {sel.size > 0 && <span className="text-xs text-muted">{sel.size} valgt</span>}
          <button
            type="button"
            onClick={doArchive}
            disabled={sel.size === 0 || pending}
            className="bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg disabled:opacity-50"
          >
            {pending ? "Arkiverer …" : `Arkiver valgte${sel.size ? ` (${sel.size})` : ""}`}
          </button>
        </span>
      </div>

      {msg && <p className="px-6 py-2 text-xs text-danger">{msg}</p>}

      {sends.length === 0 ? (
        <p className="px-6 py-8 text-sm text-muted">Ingen utsendinger i loggen.</p>
      ) : (
        <Table>
          <THead>
            <Tr head>
              <Th>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Velg alle"
                  className="accent-[#F47721]"
                />
              </Th>
              <Th>Tid</Th>
              <Th>Emne</Th>
              <Th>Segment</Th>
              <Th>Status</Th>
              <Th align="right">Sendt</Th>
            </Tr>
          </THead>
          <TBody>
            {sends.map((s) => {
              const checked = sel.has(s.id);
              const isDup = duplicateIds.has(s.id);
              return (
                <Tr key={s.id}>
                  <Td>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(s.id)}
                      aria-label={`Velg «${s.subject}»`}
                      className="accent-[#F47721]"
                    />
                  </Td>
                  <Td muted className="whitespace-nowrap">
                    {fmt(s.created_at)}
                  </Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      {s.subject}
                      {isDup && (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          duplikat
                        </span>
                      )}
                    </span>
                  </Td>
                  <Td muted>{SEG_LABEL[s.segment ?? ""] ?? s.segment ?? "—"}</Td>
                  <Td>
                    <StatusCell s={s} />
                  </Td>
                  <Td align="right" nums>
                    {s.total ? `${s.recipient_count} / ${s.total}` : s.recipient_count}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}

      {/* Arkiverte */}
      {archived.length > 0 && (
        <div className="border-t border-line px-6 py-3">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs font-medium text-muted hover:text-fg"
          >
            {showArchived ? "▾" : "▸"} Arkiverte ({archived.length})
          </button>
          {showArchived && (
            <ul className="mt-3 space-y-2">
              {archived.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted"
                >
                  <span className="whitespace-nowrap">{fmt(s.created_at)}</span>
                  <span className="text-fg">{s.subject}</span>
                  <span>{SEG_LABEL[s.segment ?? ""] ?? s.segment ?? "—"}</span>
                  <span className="tabular-nums">
                    {s.total ? `${s.recipient_count} / ${s.total}` : s.recipient_count}
                  </span>
                  <button
                    type="button"
                    onClick={() => restore(s.id)}
                    disabled={pending}
                    className="ml-auto border border-line-2 px-2 py-1 text-[11px] font-medium text-fg hover:bg-surface-2 disabled:opacity-50"
                  >
                    Gjenopprett
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
