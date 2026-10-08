import Link from "next/link";
import type { MissingSettlementDay } from "@/lib/settlement-status";

/**
 * Rød, IKKE-lukkbar banner (løsning D) som vises i kassa og admin når det
 * finnes dager med salg UTEN bekreftet kasseoppgjør. Lenker rett til
 * kasseoppgjør-siden. Returnerer null når ingenting mangler.
 *
 * Rent presentasjonell: server-siden henter de manglende dagene
 * (getMissingSettlementDays) og sender dem inn som prop. Innplasseringen i
 * admin-/kasse-layout håndteres der (se rapport). Bevisst UTEN lukk-knapp –
 * banneren skal stå til oppgjøret faktisk er bekreftet.
 */

function no(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function SettlementReminderBanner({
  missing,
  href = "/admin/kasseoppgjor",
}: {
  missing: MissingSettlementDay[];
  /** Lenkemål – default kasseoppgjør-siden i admin. */
  href?: string;
}) {
  if (!missing || missing.length === 0) return null;

  const count = missing.length;
  const dates = missing.map((m) => no(m.date));
  // Hold banneren kort: vis opptil 5 datoer, ellers «… og N flere».
  const shown = dates.slice(0, 5);
  const rest = dates.length - shown.length;
  const dateText =
    rest > 0 ? `${shown.join(", ")} … og ${rest} til` : shown.join(", ");

  return (
    <div
      role="alert"
      className="flex items-start gap-3 border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-fg"
    >
      <span className="mt-0.5 text-danger" aria-hidden>
        ●
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <strong className="font-semibold text-danger">
            Kasseoppgjør mangler
          </strong>
          <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-danger uppercase">
            Må gjøres
          </span>
        </p>
        <p className="mt-1 text-muted">
          {count === 1
            ? "Det er registrert salg denne dagen uten et bekreftet kasseoppgjør: "
            : `Det er registrert salg på ${count} dager uten bekreftet kasseoppgjør: `}
          <span className="font-medium text-fg">{dateText}</span>. Regnskapet
          blir feil til opptellingen er bekreftet.
        </p>
        <Link
          href={href}
          className="mt-2 inline-block font-semibold text-danger underline underline-offset-2 hover:no-underline"
        >
          Gå til kasseoppgjør →
        </Link>
      </div>
    </div>
  );
}
