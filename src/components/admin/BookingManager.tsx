"use client";

import { useState, useTransition } from "react";
import type { AdminBooking } from "@/lib/admin-queries";
import {
  setBookingStatus,
  type BookingStatus,
} from "@/app/admin/bookinger/actions";
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
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const statusLabel: Record<string, string> = {
  pending: "Venter",
  confirmed: "Bekreftet",
  completed: "Fullført",
  cancelled: "Avbestilt",
  no_show: "Ikke møtt",
};

const statusTone: Record<string, BadgeTone> = {
  confirmed: "accent",
  completed: "success",
  cancelled: "danger",
  pending: "neutral",
  no_show: "danger",
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("nb-NO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Row({ b }: { b: AdminBooking }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const act = (status: BookingStatus) => {
    setOpen(false);
    start(async () => {
      await setBookingStatus(b.id, status);
    });
  };

  return (
    <Tr className="align-top">
      <Td>{fmt(b.start_at)}</Td>
      <Td>
        <span className="text-fg">{b.customer}</span>
        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          {b.customerPhone && (
            <a
              href={`tel:${b.customerPhone}`}
              className="text-accent-soft hover:underline"
            >
              {b.customerPhone}
            </a>
          )}
          {b.customerEmail && (
            <a
              href={`mailto:${b.customerEmail}`}
              className="text-muted hover:text-fg hover:underline"
            >
              {b.customerEmail}
            </a>
          )}
        </span>
      </Td>
      <Td muted>{b.service}</Td>
      <Td muted>{b.barber}</Td>
      <Td className="font-display">{b.price_nok} kr</Td>
      <Td>
        <Badge tone={statusTone[b.status] ?? "neutral"}>
          {statusLabel[b.status] ?? b.status}
        </Badge>
      </Td>
      <Td align="right" className="whitespace-nowrap">
        <div className="relative inline-block">
          <Button
            variant="subtle"
            onClick={() => setOpen((o) => !o)}
            disabled={pending}
            className="px-3 py-1.5 text-xs"
          >
            {pending ? "…" : "Endre status"}
          </Button>
          {open && (
            <div className="absolute right-0 z-10 mt-1 w-40 border border-line bg-surface py-1 shadow-lg">
              <button
                onClick={() => act("completed")}
                className="block w-full px-3 py-2 text-left text-xs text-fg hover:bg-surface-2"
              >
                ✓ Fullført
              </button>
              <button
                onClick={() => act("confirmed")}
                className="block w-full px-3 py-2 text-left text-xs text-fg hover:bg-surface-2"
              >
                Bekreftet
              </button>
              <button
                onClick={() => act("no_show")}
                className="block w-full px-3 py-2 text-left text-xs text-fg hover:bg-surface-2"
              >
                Ikke møtt
              </button>
              <button
                onClick={() => act("cancelled")}
                className="block w-full px-3 py-2 text-left text-xs text-danger hover:bg-surface-2"
              >
                Avbestill
              </button>
            </div>
          )}
        </div>
      </Td>
    </Tr>
  );
}

export function BookingManager({ bookings }: { bookings: AdminBooking[] }) {
  return (
    <Card padded={false}>
      <Table>
        <THead>
          <Tr head>
            <Th>Tidspunkt</Th>
            <Th>Kunde</Th>
            <Th>Tjeneste</Th>
            <Th>Barber</Th>
            <Th>Pris</Th>
            <Th>Status</Th>
            <Th></Th>
          </Tr>
        </THead>
        <TBody>
          {bookings.length === 0 && (
            <TableEmpty colSpan={7}>
              Ingen bookinger enda. De dukker opp her når kunder bestiller time.
            </TableEmpty>
          )}
          {bookings.map((b) => (
            <Row key={b.id} b={b} />
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
