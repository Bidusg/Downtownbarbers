"use client";

import { useMemo, useState, useTransition } from "react";
import type { Absence, DayOff, StaffOption } from "@/lib/ops-queries";
import { ABSENCE_KINDS } from "@/lib/absence-kinds";
import { createAbsence, deleteAbsence, updateAbsenceKind, updateAbsence } from "@/app/admin/fravaer/actions";
import { deleteStaffException, updateStaffException } from "@/app/admin/timelister/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Card } from "@/components/ui/Card";
import {
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmpty,
} from "@/components/ui/Table";
import { Input, Select, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

function no(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Dagens dato i Oslo (YYYY-MM-DD). */
function todayOslo(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
}

type Row =
  | { type: "absence"; sort: string; a: Absence }
  | { type: "dayoff"; sort: string; d: DayOff };

export function AbsenceManager({
  absences: allAbsences,
  daysOff: allDaysOff = [],
  staff,
}: {
  absences: Absence[];
  daysOff?: DayOff[];
  staff: StaffOption[];
}) {
  // Filter: én barber (eller alle) + periode.
  const [who, setWho] = useState<string>("alle");
  const [period, setPeriod] = useState<"alle" | "kommende" | "tidligere">("alle");
  const today = todayOslo();

  const inPeriod = (from: string, to: string) =>
    period === "alle" ? true : period === "kommende" ? to >= today : to < today;

  const absences = useMemo(
    () =>
      allAbsences.filter(
        (a) => (who === "alle" || a.staff_id === who) && inPeriod(a.from_date, a.to_date),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allAbsences, who, period, today],
  );
  const daysOff = useMemo(
    () =>
      allDaysOff.filter(
        (d) => (who === "alle" || d.staff_id === who) && inPeriod(d.date, d.date),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allDaysOff, who, period, today],
  );
  const rows: Row[] = useMemo(
    () =>
      [
        ...absences.map((a) => ({ type: "absence" as const, sort: a.from_date, a })),
        ...daysOff.map((d) => ({ type: "dayoff" as const, sort: d.date, d })),
      ].sort((x, y) => (x.sort < y.sort ? 1 : x.sort > y.sort ? -1 : 0)),
    [absences, daysOff],
  );

  // Antall per barber (uavhengig av barber-filteret) til filter-knappene.
  const countFor = (id: string) =>
    allAbsences.filter((a) => a.staff_id === id && inPeriod(a.from_date, a.to_date)).length +
    allDaysOff.filter((d) => d.staff_id === id && inPeriod(d.date, d.date)).length;
  const withEntries = staff.filter((s) => countFor(s.id) > 0 || who === s.id);

  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [ed, setEd] = useState({ from_date: "", to_date: "", kind: "ulonnet", reason: "" });
  // Redigering av fri fra timelister (staff_exceptions).
  const [offEdit, setOffEdit] = useState<{
    id: string;
    date: string;
    whole: boolean;
    start: string;
    end: string;
    paid: boolean;
    note: string;
  } | null>(null);

  function saveOff() {
    if (!offEdit) return;
    setErr(null);
    if (!offEdit.date) return setErr("Velg dato.");
    if (!offEdit.whole && (!offEdit.start || !offEdit.end || offEdit.end <= offEdit.start))
      return setErr("Sett gyldig tidsrom for fri (slutt etter start), eller velg hele dagen.");
    const fd = new FormData();
    fd.set("date", offEdit.date);
    fd.set("kind", "off");
    if (!offEdit.whole) {
      fd.set("start_time", offEdit.start);
      fd.set("end_time", offEdit.end);
    }
    fd.set("note", offEdit.note);
    fd.set("paid", offEdit.paid ? "true" : "false");
    start(async () => {
      const res = await updateStaffException(offEdit.id, fd);
      if (res?.error) setErr(res.error);
      else setOffEdit(null);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {absences.length} fravær · {daysOff.length} fridager fra timelister
          {who !== "alle" && <> for {staff.find((s) => s.id === who)?.full_name ?? "valgt barber"}</>}
        </p>
        <Button
          variant="primary"
          onClick={() => {
            setErr(null);
            setOpen((o) => !o);
          }}
          className="px-4 py-2 text-sm"
        >
          {open ? "Lukk" : "+ Nytt fravær"}
        </Button>
      </div>

      {open && (
        <Card>
          <form
            action={(fd) =>
              start(async () => {
                setErr(null);
                const res = await createAbsence(fd);
                if (res.error) setErr(res.error);
                else setOpen(false);
              })
            }
            className="grid gap-3 sm:grid-cols-2"
          >
            <Select name="staff_id" required defaultValue={who === "alle" ? "" : who} key={who}>
              <option value="" disabled>
                Velg ansatt …
              </option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </Select>
            <Select name="kind" required defaultValue="ulonnet">
              {ABSENCE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                  {k.deduct ? " – trekkes i lønn" : ""}
                </option>
              ))}
            </Select>
            <Input name="reason" placeholder="Kommentar (valgfritt)" className="sm:col-span-2" />
            <Field label="Fra dato">
              <Input name="from_date" type="date" required />
            </Field>
            <Field label="Til dato">
              <Input name="to_date" type="date" required />
            </Field>
            {err && <p className="text-sm text-danger sm:col-span-2">{err}</p>}
            <Button
              type="submit"
              variant="primary"
              disabled={pending}
              className="px-4 py-2 text-sm sm:col-span-2"
            >
              {pending ? "Lagrer …" : "Lagre fravær"}
            </Button>
          </form>
        </Card>
      )}

      {/* Filter: barber for barber + periode */}
      <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold tracking-wide text-muted uppercase">Barber</span>
          <button
            type="button"
            onClick={() => setWho("alle")}
            className={"act " + (who === "alle" ? "act-accent ring-1 ring-accent-soft" : "")}
          >
            Alle
          </button>
          {withEntries.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setWho(s.id)}
              className={"act " + (who === s.id ? "act-accent ring-1 ring-accent-soft" : "")}
            >
              {s.full_name}
              <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-[10px] font-bold text-muted">
                {countFor(s.id)}
              </span>
            </button>
          ))}
          {staff.length > withEntries.length && (
            <select
              value={withEntries.some((s) => s.id === who) || who === "alle" ? "" : who}
              onChange={(e) => e.target.value && setWho(e.target.value)}
              className="rounded-md border border-line-2 bg-canvas px-2 py-1.5 text-xs text-fg"
              aria-label="Velg annen barber"
            >
              <option value="">Andre …</option>
              {staff
                .filter((s) => !withEntries.includes(s))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
            </select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold tracking-wide text-muted uppercase">Periode</span>
          {(
            [
              ["alle", "Alle"],
              ["kommende", "Pågående og kommende"],
              ["tidligere", "Tidligere"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setPeriod(v)}
              className={"act " + (period === v ? "act-accent ring-1 ring-accent-soft" : "")}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {err && !open && <p className="text-sm text-danger">{err}</p>}
      <p className="text-xs text-muted">
        Ulønnet permisjon, ugyldig fravær og ubetalt fri trekkes i grunnlønnen (grunnlønn ÷
        arbeidsdager i måneden × fraværsdager; delvis ubetalt fri regnes som andel av dagen).
        Sykdom, ferie, annet og betalt fri trekkes ikke.
      </p>
      <Card padded={false}>
        <Table>
          <THead>
            <Tr head>
              <Th>Ansatt</Th>
              <Th>Fra</Th>
              <Th>Til</Th>
              <Th>Type</Th>
              <Th>Kommentar</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {rows.length === 0 && (
              <TableEmpty colSpan={6}>
                {who === "alle" && period === "alle"
                  ? "Ingen fravær registrert enda."
                  : "Ingen fravær eller fridager for dette utvalget."}
              </TableEmpty>
            )}
            {rows.map((row) => {
              if (row.type === "dayoff") {
                const d = row.d;
                if (offEdit?.id === d.id) {
                  const o = offEdit;
                  return (
                    <Tr key={"off-" + d.id}>
                      <Td className="font-medium text-fg">{d.staffName}</Td>
                      <Td colSpan={2}>
                        <Input type="date" value={o.date} onChange={(e) => setOffEdit({ ...o, date: e.target.value })} />
                        <label className="mt-2 flex items-center gap-2 text-xs text-fg">
                          <input
                            type="checkbox"
                            checked={o.whole}
                            onChange={(e) => setOffEdit({ ...o, whole: e.target.checked })}
                            className="accent-[#F47721]"
                          />
                          Hele dagen
                        </label>
                        {!o.whole && (
                          <span className="mt-2 flex items-center gap-1.5">
                            <Input type="time" value={o.start} onChange={(e) => setOffEdit({ ...o, start: e.target.value })} />
                            <span className="text-muted">–</span>
                            <Input type="time" value={o.end} onChange={(e) => setOffEdit({ ...o, end: e.target.value })} />
                          </span>
                        )}
                      </Td>
                      <Td>
                        <select
                          value={o.paid ? "betalt" : "ubetalt"}
                          onChange={(e) => setOffEdit({ ...o, paid: e.target.value === "betalt" })}
                          className={
                            "rounded-md border bg-canvas px-2 py-1 text-xs " +
                            (o.paid ? "border-line-2 text-fg" : "border-danger/50 text-danger")
                          }
                        >
                          <option value="betalt">Betalt fri</option>
                          <option value="ubetalt">Ubetalt fri – trekkes i lønn</option>
                        </select>
                      </Td>
                      <Td>
                        <Input value={o.note} onChange={(e) => setOffEdit({ ...o, note: e.target.value })} placeholder="Beskrivelse" />
                      </Td>
                      <Td align="right">
                        <span className="flex justify-end gap-3 text-xs">
                          <button className="act act-accent" disabled={pending} onClick={saveOff}>
                            {pending ? "Lagrer …" : "Lagre"}
                          </button>
                          <button className="act" onClick={() => setOffEdit(null)}>
                            Avbryt
                          </button>
                        </span>
                      </Td>
                    </Tr>
                  );
                }
                return (
                  <Tr key={"off-" + d.id}>
                    <Td className="font-medium text-fg">{d.staffName}</Td>
                    <Td muted>{no(d.date)}</Td>
                    <Td muted>{no(d.date)}</Td>
                    <Td>
                      <span
                        className={
                          "inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold " +
                          (d.paid
                            ? "border-line-2 bg-surface-2 text-fg"
                            : "border-danger/50 bg-danger/10 text-danger")
                        }
                      >
                        {d.paid ? "Betalt fri" : "Ubetalt fri"}
                        {d.start_time && d.end_time ? ` ${d.start_time}–${d.end_time}` : " · hele dagen"}
                      </span>
                    </Td>
                    <Td muted>
                      {d.note ?? "—"}
                      <span className="mt-0.5 block text-[10px] tracking-wide text-muted uppercase">
                        Fra timelister · {d.paid ? "trekkes ikke" : "trekkes i lønn"}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="flex items-center justify-end gap-3">
                        <button
                          className="act act-accent"
                          onClick={() => {
                            setErr(null);
                            setEditId(null);
                            setOffEdit({
                              id: d.id,
                              date: d.date,
                              whole: !(d.start_time && d.end_time),
                              start: d.start_time ?? "",
                              end: d.end_time ?? "",
                              paid: d.paid,
                              note: d.note ?? "",
                            });
                          }}
                        >
                          Rediger
                        </button>
                        <ConfirmButton
                          label="Slett"
                          confirmLabel="Ja, slett"
                          pendingLabel="Sletter …"
                          disabled={pending}
                          onConfirm={() => deleteStaffException(d.id)}
                        />
                      </span>
                    </Td>
                  </Tr>
                );
              }
              const a = row.a;
              return editId === a.id ? (
                <Tr key={a.id}>
                  <Td className="font-medium text-fg">{a.staffName}</Td>
                  <Td>
                    <Input type="date" value={ed.from_date} onChange={(e) => setEd({ ...ed, from_date: e.target.value })} />
                  </Td>
                  <Td>
                    <Input type="date" value={ed.to_date} onChange={(e) => setEd({ ...ed, to_date: e.target.value })} />
                  </Td>
                  <Td>
                    <select
                      value={ed.kind}
                      onChange={(e) => setEd({ ...ed, kind: e.target.value })}
                      className="rounded-md border border-line-2 bg-canvas px-2 py-1 text-xs text-fg"
                    >
                      {ABSENCE_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td>
                    <Input value={ed.reason} onChange={(e) => setEd({ ...ed, reason: e.target.value })} placeholder="Kommentar" />
                  </Td>
                  <Td align="right">
                    <span className="flex justify-end gap-3 text-xs">
                      <button
                        className="act act-accent"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            setErr(null);
                            const res = await updateAbsence(a.id, ed);
                            if (res.error) setErr(res.error);
                            else setEditId(null);
                          })
                        }
                      >
                        {pending ? "Lagrer …" : "Lagre"}
                      </button>
                      <button className="act" onClick={() => setEditId(null)}>
                        Avbryt
                      </button>
                    </span>
                  </Td>
                </Tr>
              ) : (
              <Tr key={a.id}>
                <Td className="font-medium text-fg">{a.staffName}</Td>
                <Td muted>{no(a.from_date)}</Td>
                <Td muted>{no(a.to_date)}</Td>
                <Td>
                  <select
                    value={a.kind}
                    disabled={pending}
                    onChange={(e) => {
                      const v = e.target.value;
                      start(async () => {
                        setErr(null);
                        const res = await updateAbsenceKind(a.id, v);
                        if (res.error) setErr(res.error);
                      });
                    }}
                    className={
                      "rounded-md border bg-canvas px-2 py-1 text-xs " +
                      (ABSENCE_KINDS.find((k) => k.value === a.kind)?.deduct
                        ? "border-danger/50 text-danger"
                        : "border-line-2 text-fg")
                    }
                  >
                    {ABSENCE_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </Td>
                <Td muted>{a.reason ?? "—"}</Td>
                <Td align="right">
                  <span className="flex items-center justify-end gap-3">
                    <button
                      className="act act-accent"
                      onClick={() => {
                        setErr(null);
                        setOffEdit(null);
                        setEditId(a.id);
                        setEd({ from_date: a.from_date, to_date: a.to_date, kind: a.kind, reason: a.reason ?? "" });
                      }}
                    >
                      Rediger
                    </button>
                    <ConfirmButton
                      label="Slett"
                      confirmLabel="Ja, slett"
                      pendingLabel="Sletter …"
                      disabled={pending}
                      onConfirm={() => deleteAbsence(a.id)}
                    />
                  </span>
                </Td>
              </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
