"use client";

import { useState, useTransition } from "react";
import type { BookingBlock } from "@/lib/ops-queries";
import {
  createBookingBlock,
  updateBookingBlock,
  deleteBookingBlock,
} from "@/app/admin/timelister/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";

const inputCls =
  "border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft";

function fmtDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function BookingBlocksManager({ blocks }: { blocks: BookingBlock[] }) {
  // null = skjult, "new" = ny blokkering, ellers = redigerer den blokkeringen.
  const [editing, setEditing] = useState<"new" | BookingBlock | null>(null);
  const [wholeDay, setWholeDay] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();
  const [delPending, startDel] = useTransition();

  const isEdit = editing !== null && editing !== "new";
  const cur = isEdit ? (editing as BookingBlock) : null;

  function openNew() {
    setEditing("new");
    setWholeDay(true);
    setMsg(null);
    setErr(false);
  }
  function openEdit(b: BookingBlock) {
    setEditing(b);
    setWholeDay(!(b.start_time && b.end_time));
    setMsg(null);
    setErr(false);
  }
  function close() {
    setEditing(null);
    setMsg(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {blocks.length} kommende blokkering{blocks.length === 1 ? "" : "er"}
        </p>
        <Button
          variant="primary"
          onClick={() => (editing === "new" ? close() : openNew())}
          className="px-4 py-2 text-sm"
        >
          {editing === "new" ? "Lukk" : "+ Ny blokkering"}
        </Button>
      </div>

      {editing !== null && (
        <form
          // Nøkkel tvinger ferske defaultValue når man bytter mellom rader/ny.
          key={cur?.id ?? "new"}
          action={(fd) =>
            start(async () => {
              setMsg(null);
              setErr(false);
              const r = isEdit
                ? await updateBookingBlock(fd)
                : await createBookingBlock(fd);
              if (r.error) {
                setErr(true);
                setMsg(r.error);
              } else {
                setMsg(isEdit ? "Blokkering oppdatert ✓" : "Blokkering lagret ✓");
                setEditing(null);
              }
            })
          }
          className="space-y-3 border border-line bg-surface p-4"
        >
          {cur && <input type="hidden" name="id" value={cur.id} />}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Dato
              <input
                type="date"
                name="block_date"
                required
                defaultValue={cur?.date ?? ""}
                className={inputCls}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                name="whole_day"
                checked={wholeDay}
                onChange={(e) => setWholeDay(e.target.checked)}
                className="accent-accent"
              />
              Hele dagen
            </label>
            {!wholeDay && (
              <>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Fra
                  <input
                    type="time"
                    name="start_time"
                    defaultValue={cur?.start_time ?? "12:00"}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Til
                  <input
                    type="time"
                    name="end_time"
                    defaultValue={cur?.end_time ?? "16:00"}
                    className={inputCls}
                  />
                </label>
              </>
            )}
          </div>
          <Input
            name="reason"
            placeholder="Grunn (valgfritt) – f.eks. helligdag, arrangement"
            defaultValue={cur?.reason ?? ""}
          />
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={pending}
              className="px-4 py-2 text-sm"
            >
              {pending ? "Lagrer …" : isEdit ? "Lagre endring" : "Blokker"}
            </Button>
            {isEdit && (
              <Button
                type="button"
                variant="ghost"
                onClick={close}
                className="px-4 py-2 text-sm"
              >
                Avbryt
              </Button>
            )}
            {msg && (
              <span className={"text-sm " + (err ? "text-danger" : "text-muted")}>
                {msg}
              </span>
            )}
          </div>
        </form>
      )}

      {blocks.length > 0 && (
        <Card padded={false}>
          <Table>
            <THead>
              <Tr head className="bg-surface-2 tracking-wide uppercase">
                <Th>Dato</Th>
                <Th>Tid</Th>
                <Th>Grunn</Th>
                <Th></Th>
              </Tr>
            </THead>
            <TBody>
              {blocks.map((b) => (
                <Tr key={b.id}>
                  <Td className="text-fg">{fmtDate(b.date)}</Td>
                  <Td muted>
                    {b.start_time && b.end_time
                      ? `${b.start_time}–${b.end_time}`
                      : "Hele dagen"}
                  </Td>
                  <Td muted>{b.reason ?? "—"}</Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(b)}
                        className="text-sm text-accent-soft hover:underline"
                      >
                        Endre
                      </button>
                      <ConfirmButton
                        label="Fjern"
                        confirmLabel="Ja, fjern"
                        pendingLabel="Fjerner …"
                        disabled={delPending}
                        onConfirm={() => startDel(() => deleteBookingBlock(b.id))}
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
