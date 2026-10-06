/** Fraværstyper (klient-trygg – ingen server-import). */
export type AbsenceKind = "ulonnet" | "ugyldig" | "syk" | "ferie" | "annet";
export const ABSENCE_KINDS: { value: AbsenceKind; label: string; deduct: boolean }[] = [
  { value: "ulonnet", label: "Ulønnet permisjon / fri", deduct: true },
  { value: "ugyldig", label: "Ugyldig fravær", deduct: true },
  { value: "syk", label: "Sykefravær", deduct: false },
  { value: "ferie", label: "Ferie", deduct: false },
  { value: "annet", label: "Annet", deduct: false },
];
