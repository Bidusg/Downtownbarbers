"use server";

import { createClient } from "@/lib/supabase/server";

export type ClockStaff = {
  id: string;
  full_name: string;
  photo_url: string | null;
  has_pin: boolean;
};

export type ShiftStatus = "off" | "on" | "paused";

/** Aktive ansatte som vises på stemplingsskjermen, med dagens status + timer. */
export async function getClockBoard(): Promise<
  (ClockStaff & { status: ShiftStatus; workedMinutes: number })[]
> {
  try {
    const sb = await createClient();
    const [{ data: staff }, { data: summary }] = await Promise.all([
      sb.rpc("active_staff_for_clock"),
      sb.rpc("shift_summary_today"),
    ]);
    const sums = new Map(
      ((summary as { staff_id: string; status: string; worked_minutes: number }[]) ?? []).map(
        (s) => [s.staff_id, s],
      ),
    );
    return ((staff as ClockStaff[]) ?? []).map((s) => {
      const sm = sums.get(s.id);
      return {
        ...s,
        status: ((sm?.status as ShiftStatus) ?? "off") as ShiftStatus,
        workedMinutes: sm?.worked_minutes ?? 0,
      };
    });
  } catch {
    return [];
  }
}

/** Verifiser PIN og få nåværende status (for å vise riktige knapper). */
export async function verifyPin(
  staffId: string,
  pin: string,
): Promise<{ ok: true; status: ShiftStatus } | { ok: false; error: string }> {
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("verify_pin_status", {
      p_staff: staffId,
      p_pin: pin,
    });
    if (error) return { ok: false, error: "feil" };
    const res = String(data ?? "");
    if (res === "ERR:wrong_pin") return { ok: false, error: "Feil PIN." };
    if (res === "ERR:no_pin")
      return { ok: false, error: "Ingen PIN satt. Be admin registrere en PIN." };
    return { ok: true, status: res as ShiftStatus };
  } catch {
    return { ok: false, error: "Noe gikk galt." };
  }
}

/** Registrer en handling (start/pause/resume/end) etter PIN-verifisering. */
export async function punch(
  staffId: string,
  pin: string,
  type: "start" | "pause" | "resume" | "end",
): Promise<{ ok: true; status: ShiftStatus } | { ok: false; error: string }> {
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("record_shift_event", {
      p_staff: staffId,
      p_pin: pin,
      p_type: type,
    });
    if (error) return { ok: false, error: "Kunne ikke registrere." };
    const res = String(data ?? "");
    if (res.startsWith("ERR:")) {
      const map: Record<string, string> = {
        "ERR:wrong_pin": "Feil PIN.",
        "ERR:no_pin": "Ingen PIN satt.",
        "ERR:already_on": "Du er allerede på vakt.",
        "ERR:not_on": "Du er ikke på vakt.",
        "ERR:not_paused": "Du er ikke i pause.",
        "ERR:bad_type": "Ugyldig handling.",
      };
      return { ok: false, error: map[res] ?? "Ugyldig handling." };
    }
    return { ok: true, status: res as ShiftStatus };
  } catch {
    return { ok: false, error: "Noe gikk galt." };
  }
}
