"use server";

import { requireRole } from "@/lib/auth";
import { getDayAgenda, type AgendaBooking } from "@/lib/shop-queries";

export type KioskBooking = {
  id: string;
  time: string; // HH:MM
  customer: string | null;
  service: string | null;
  status: string;
};

export type KioskDay = {
  iso: string;
  weekday: string;
  dayNum: string;
  month: string;
  isToday: boolean;
  bookings: KioskBooking[];
};

function osloToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
}

function timeLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("nb-NO", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Oslo",
    });
  } catch {
    return "";
  }
}

/**
 * En ansatts bookinger 7 dager frem (i dag + 6), én rad per dag.
 * Gjenbruker day_agenda-RPC-en og filtrerer på staff_id. Kun shop/admin.
 */
export async function getStaffWeek(
  staffId: string,
  days = 7,
): Promise<KioskDay[]> {
  await requireRole(["shop", "admin"]);
  if (!staffId) return [];

  const today = osloToday();
  const start = new Date(`${today}T00:00:00`);
  const isoList: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    isoList.push(d.toLocaleDateString("en-CA"));
  }

  const agendas = await Promise.all(isoList.map((iso) => getDayAgenda(iso)));

  return isoList.map((iso, i) => {
    const d = new Date(`${iso}T00:00:00`);
    const mine = (agendas[i] as AgendaBooking[])
      .filter((b) => b.staff_id === staffId)
      .filter((b) => b.status !== "cancelled")
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
      .map<KioskBooking>((b) => ({
        id: b.id,
        time: timeLabel(b.start_at),
        customer: b.customer,
        service: b.service,
        status: b.status,
      }));
    return {
      iso,
      weekday: d.toLocaleDateString("nb-NO", { weekday: "short" }),
      dayNum: String(d.getDate()),
      month: d.toLocaleDateString("nb-NO", { month: "short" }),
      isToday: iso === today,
      bookings: mine,
    };
  });
}
