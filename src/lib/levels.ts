// Barber-nivåer – delt kilde for admin (prismatrise, ansattnivå) og booking.
// Hvert nivå kan ha egen pris + varighet per tjeneste (service_level_prices).

export const STAFF_LEVELS = ["junior", "barber", "senior", "master"] as const;
export type StaffLevel = (typeof STAFF_LEVELS)[number];

export const LEVEL_LABEL: Record<StaffLevel, string> = {
  junior: "Junior",
  barber: "Barber",
  senior: "Senior",
  master: "Master",
};

export function isStaffLevel(v: string | null | undefined): v is StaffLevel {
  return !!v && (STAFF_LEVELS as readonly string[]).includes(v);
}

/** Trygt nivå med fallback til 'barber'. */
export function asStaffLevel(v: string | null | undefined): StaffLevel {
  return isStaffLevel(v) ? v : "barber";
}
