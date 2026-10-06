"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { colorAt } from "@/lib/colors";
import type { Absence, StaffException, StaffHour, StaffOption } from "@/lib/ops-queries";
import { createStaffException, updateStaffException, deleteStaffException } from "@/app/admin/timelister/actions";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";

const WEEKDAY_NAMES = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

/** Neste dato (i dag eller senere) som faller på ukedag `dow` (0 = søn). */
function nextDateFor(dow: number): string {
  const now = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" }) + "T12:00:00Z");
  const diff = (dow - now.getUTCDay() + 7) % 7;
  now.setUTCDate(now.getUTCDate() + diff);
  return now.toISOString().slice(0, 10);
}

type Pick = { staff: StaffOption; dow: number; date: string; start: string; end: string };

/** Dato (YYYY-MM-DD) for ukedag `dow` i uken som starter mandag `weekStart`. */
function dateInWeek(weekStart: string, dow: number): string {
  const d = new Date(weekStart + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}
const dm = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`;

/** Popup: sett, endre eller slett vakt / fri for én bestemt dato. */
function SingleDayDialog({
  pick,
  staffExceptions,
  onClose,
}: {
  pick: Pick;
  staffExceptions: StaffException[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(pick.date || nextDateFor(pick.dow));
  const [editId, setEditId] = useState<string | null>(null);
  const [kind, setKind] = useState<"extra" | "off">("extra");
  const [start, setStart] = useState(pick.start);
  const [end, setEnd] = useState(pick.end);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const field =
    "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg focus:border-accent-soft focus:outline-none";
  const existing = staffExceptions
    .filter((e) => e.date === date)
    .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));

  function startEdit(e: StaffException) {
    setErr(null);
    setEditId(e.id);
    setKind(e.kind);
    setStart(e.start_time ?? "");
    setEnd(e.end_time ?? "");
    setNote(e.note ?? "");
  }
  function resetForm() {
    setEditId(null);
    setKind("extra");
    setStart(pick.start);
    setEnd(pick.end);
    setNote("");
  }

  function save() {
    setErr(null);
    if (!date) return setErr("Velg dato.");
    if (kind === "extra" && (!start || !end || end <= start)) return setErr("Sett gyldig tid (slutt etter start).");
    const fd = new FormData();
    fd.set("staff_id", pick.staff.id);
    fd.set("date", date);
    fd.set("kind", kind);
    if (start && end) {
      fd.set("start_time", start);
      fd.set("end_time", end);
    }
    fd.set("note", note);
    run(async () => {
      const r = editId ? await updateStaffException(editId, fd) : await createStaffException(fd);
      if (r?.error) return setErr(r.error);
      router.refresh();
      onClose();
    });
  }

  function remove(id: string) {
    setErr(null);
    run(async () => {
      const r = await deleteStaffException(id);
      if (r?.error) return setErr(r.error);
      router.refresh();
      if (editId === id) resetForm();
      onClose();
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-fg">{pick.staff.full_name}</h2>
            <p className="text-xs text-muted">
              Vakt eller fri for én dato. En vakt her erstatter turnusen den dagen.
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-muted hover:text-fg" aria-label="Lukk">
            ✕
          </button>
        </div>

        <label className="block text-xs text-muted">
          Dato
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              resetForm();
            }}
            className={field + " mt-1"}
          />
        </label>

        {/* Det som allerede er satt for datoen – endre / slett */}
        {existing.length > 0 && (
          <ul className="mt-3 divide-y divide-line rounded-md border border-line">
            {existing.map((e) => (
              <li key={e.id} className={"flex items-center justify-between gap-2 px-3 py-2 text-sm " + (editId === e.id ? "bg-accent-soft/10" : "")}>
                <span className="min-w-0">
                  <span className="font-semibold text-fg">
                    {e.kind === "extra" ? "Vakt" : "Fri"}{" "}
                    {e.start_time && e.end_time ? `${e.start_time}–${e.end_time}` : "hele dagen"}
                  </span>
                  {e.note && <span className="block truncate text-xs text-muted">{e.note}</span>}
                </span>
                <span className="flex shrink-0 gap-3 text-xs">
                  <button onClick={() => startEdit(e)} className="act act-accent" disabled={pending}>
                    Endre
                  </button>
                  <button onClick={() => remove(e.id)} className="act act-danger" disabled={pending}>
                    Slett
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 space-y-3">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {editId ? "Endre" : existing.length ? "Legg til" : "Ny"}
          </p>
          <div className="flex overflow-hidden rounded-md border border-line-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setKind("extra")}
              className={"flex-1 px-3 py-2 " + (kind === "extra" ? "bg-accent text-accent-fg" : "text-muted")}
            >
              Vakt denne dagen
            </button>
            <button
              type="button"
              onClick={() => setKind("off")}
              className={"flex-1 px-3 py-2 " + (kind === "off" ? "bg-accent text-accent-fg" : "text-muted")}
            >
              Fri denne dagen
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-muted">
              Fra
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={field + " mt-1"} />
            </label>
            <label className="block text-xs text-muted">
              Til
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={field + " mt-1"} />
            </label>
          </div>
          {kind === "off" && (
            <p className="text-[11px] text-muted">Tøm tidene for fri hele dagen, eller sett tidsrommet som er fri.</p>
          )}
          <label className="block text-xs text-muted">
            Notat (valgfritt)
            <input value={note} onChange={(e) => setNote(e.target.value)} className={field + " mt-1"} />
          </label>
          {err && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            {editId ? (
              <button onClick={resetForm} className="rounded-md border border-line-2 px-4 py-2 text-sm text-fg">
                Avbryt endring
              </button>
            ) : (
              <button onClick={onClose} className="rounded-md border border-line-2 px-4 py-2 text-sm text-fg">
                Lukk
              </button>
            )}
            <button
              onClick={save}
              disabled={pending}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg disabled:opacity-60"
            >
              {pending ? "Lagrer …" : editId ? "Lagre endring" : "Lagre"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const DAYS = [
  { n: 1, l: "Man" },
  { n: 2, l: "Tir" },
  { n: 3, l: "Ons" },
  { n: 4, l: "Tor" },
  { n: 5, l: "Fre" },
  { n: 6, l: "Lør" },
  { n: 0, l: "Søn" },
];
const BASE = 9 * 60; // 09:00
const SPAN = 12 * 60; // 09–21

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// "09:00" → "9", "09:30" → "9:30" (kompakt for smale celler)
function compact(t: string) {
  const [h, m] = t.split(":");
  return m === "00" ? String(Number(h)) : `${Number(h)}:${m}`;
}

/**
 * Visuell ukeplan (turnus): én rad per barber, én kolonne per ukedag,
 * med arbeidstiden tegnet som fargede bånd på en 09–21-skala.
 */
export function WeekSchedule({
  hours,
  staff,
  parity = 1,
  weekStart,
  exceptions = [],
  absences = [],
}: {
  hours: StaffHour[];
  staff: StaffOption[];
  /** Mandag i uken som vises (datoer i overskriften + avvik/fravær). */
  weekStart?: string;
  exceptions?: StaffException[];
  absences?: Absence[];
  /** Hvilken uke-indeks (1..N) som vises. Rader for "hver uke" (0) vises alltid. */
  parity?: number;
}) {
  const [pick, setPick] = useState<Pick | null>(null);
  if (staff.length === 0)
    return <EmptyState description="Legg til ansatte under Ansatte først." />;
  const cols = "120px repeat(7, minmax(72px, 1fr))";

  return (
    <div className="mb-8 overflow-x-auto border border-line bg-surface">
      <div className="min-w-[760px]">
        {/* Header */}
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          <div className="bg-surface-2 px-3 py-2 text-xs font-semibold tracking-wide text-muted uppercase">
            Barber
          </div>
          {DAYS.map((d) => (
            <div
              key={d.n}
              className="border-l border-line bg-surface-2 px-2 py-2 text-center text-xs font-semibold tracking-wide text-muted uppercase"
            >
              {d.l}
              {weekStart && (
                <span className="ml-1 font-normal normal-case text-muted/80">{dm(dateInWeek(weekStart, d.n))}</span>
              )}
            </div>
          ))}
        </div>

        {/* Rader */}
        {staff.map((s, i) => {
          const color = colorAt(i);
          return (
            <div
              key={s.id}
              className="grid items-center border-t border-line"
              style={{ gridTemplateColumns: cols }}
            >
              <div className="truncate px-3 py-2 text-sm font-medium text-fg">
                {s.full_name}
              </div>
              {DAYS.map((d) => {
                const date = weekStart ? dateInWeek(weekStart, d.n) : "";
                const shifts = hours.filter(
                  (h) =>
                    h.staff_id === s.id &&
                    h.weekday === d.n &&
                    (h.week_parity === 0 || h.week_parity === parity) &&
                    (!date || ((!h.valid_from || h.valid_from <= date) && (!h.valid_to || h.valid_to >= date))),
                );
                const dayEx = date ? exceptions.filter((e) => e.staff_id === s.id && e.date === date) : [];
                const extras = dayEx.filter((e) => e.kind === "extra" && e.start_time && e.end_time);
                const offAll = dayEx.some((e) => e.kind === "off" && !e.start_time);
                const absent = date
                  ? absences.find((a) => a.staff_id === s.id && a.from_date <= date && a.to_date >= date)
                  : undefined;
                const blocked = (offAll || !!absent) && extras.length === 0;
                return (
                  <button
                    type="button"
                    key={d.n}
                    onClick={() =>
                      setPick({
                        staff: s,
                        dow: d.n,
                        date,
                        start: shifts[0]?.start_time ?? "10:00",
                        end: shifts[0]?.end_time ?? "19:00",
                      })
                    }
                    title={`Sett, endre eller slett vakt / fri for ${s.full_name} denne datoen`}
                    className="group block border-l border-line px-1.5 py-2 text-left transition-colors hover:bg-accent-soft/10"
                  >
                    <div className="relative h-6 overflow-hidden rounded bg-surface-2/50 ring-accent-soft/60 group-hover:ring-1">
                      {/* Ekstravakter denne datoen (vinner over fravær) */}
                      {extras.map((e) => {
                        const a = toMin(e.start_time as string);
                        const b = toMin(e.end_time as string);
                        const left = Math.max(0, ((a - BASE) / SPAN) * 100);
                        const width = Math.max(6, Math.min(100 - left, ((b - a) / SPAN) * 100));
                        return (
                          <div
                            key={e.id}
                            title={`Vakt denne dagen ${e.start_time}–${e.end_time}${e.note ? ` · ${e.note}` : ""}`}
                            className="absolute top-0 z-[2] flex h-6 items-center justify-center rounded border border-dashed border-[#211E1A]/40"
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              background: `repeating-linear-gradient(45deg, ${color}, ${color} 5px, ${color}cc 5px, ${color}cc 10px)`,
                            }}
                          >
                            <span className="truncate px-1 text-[10px] font-semibold text-[#211E1A]">
                              + {compact(e.start_time as string)}–{compact(e.end_time as string)}
                            </span>
                          </div>
                        );
                      })}
                      {blocked && (
                        <div
                          className="absolute inset-0 z-[3] flex items-center justify-center rounded bg-surface-2/90 text-[10px] font-semibold text-muted"
                          title={absent ? `Fravær ${formatDate(absent.from_date)}–${formatDate(absent.to_date)}${absent.reason ? ` · ${absent.reason}` : ""}` : "Fri hele dagen"}
                        >
                          {absent ? "Fravær" : "Fri"}
                        </div>
                      )}
                      {shifts.length === 0 && extras.length === 0 && !blocked && (
                        <span className="absolute inset-0 flex items-center justify-center text-[11px] text-muted opacity-0 group-hover:opacity-100">
                          + vakt
                        </span>
                      )}
                      {/* Vakt satt for datoen erstatter turnusen den dagen */}
                      {extras.length === 0 && shifts.map((h, j) => {
                        const a = toMin(h.start_time);
                        const b = toMin(h.end_time);
                        const left = Math.max(0, ((a - BASE) / SPAN) * 100);
                        const width = Math.max(
                          6,
                          Math.min(100 - left, ((b - a) / SPAN) * 100),
                        );
                        return (
                          <div
                            key={j}
                            title={`${h.start_time}–${h.end_time}`}
                            className="absolute top-0 flex h-6 items-center justify-center rounded"
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              background: color,
                            }}
                          >
                            <span className="truncate px-1 text-[10px] font-semibold text-[#211E1A]">
                              {compact(h.start_time)}–{compact(h.end_time)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="border-t border-line px-3 py-1.5 text-[10px] text-muted">
        Tidsskala 09–21. Trykk på en dag for å legge inn en ekstravakt eller fri for akkurat den datoen
        (stripet = vakt satt for datoen – erstatter turnusen; grå = fravær/fri). Fast turnus endres i redigeringen under.
      </p>
      {pick && (
        <SingleDayDialog
          pick={pick}
          staffExceptions={exceptions.filter((e) => e.staff_id === pick.staff.id)}
          onClose={() => setPick(null)}
        />
      )}
    </div>
  );
}
