import Link from "next/link";
import { StaffHoursManager } from "@/components/admin/StaffHoursManager";
import { StaffExceptionsManager } from "@/components/admin/StaffExceptionsManager";
import { BulkTurnusForm } from "@/components/admin/BulkTurnusForm";
import { BookingBlocksManager } from "@/components/admin/BookingBlocksManager";
import { RotationControl } from "@/components/admin/RotationControl";
import { WeekSchedule } from "@/components/admin/WeekSchedule";
import { TurnusOverview } from "@/components/admin/TurnusOverview";
import {
  getStaffHours,
  getStaffOptions,
  getTurnusRotation,
  getStaffExceptions,
  getBookingBlocks,
  getAbsences,
} from "@/lib/ops-queries";
import { parityLabel, parityOptions } from "@/lib/turnus";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

/** Mandag (YYYY-MM-DD) i neste uke som er rotasjonsuke `sel` (denne uken hvis den er det). */
function weekStartFor(sel: number, current: number, weeks: number): string {
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" }) + "T12:00:00Z");
  const dow = today.getUTCDay();
  today.setUTCDate(today.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  const ahead = weeks > 1 ? (sel - current + weeks) % weeks : 0;
  today.setUTCDate(today.getUTCDate() + ahead * 7);
  return today.toISOString().slice(0, 10);
}

export default async function AdminTimelister({
  searchParams,
}: {
  searchParams: Promise<{ uke?: string; ansatt?: string; vis?: string }>;
}) {
  const sp = await searchParams;
  const [hours, staff, rotation, exceptions, blocks, absences] = await Promise.all([
    getStaffHours(),
    getStaffOptions(),
    getTurnusRotation(),
    getStaffExceptions(),
    getBookingBlocks(),
    getAbsences(),
  ]);

  const weeks = rotation.weeks;
  const options = parityOptions(weeks); // [1..weeks]
  // Valgt uke fra ?uke=N (default: uken som gjelder nå).
  const req = Number(sp.uke);
  const selected =
    Number.isInteger(req) && req >= 1 && req <= weeks ? req : rotation.currentIndex;

  // Filter: én ansatt (eller alle) + visning (ukeplan / uke for uke).
  const who = staff.find((s) => s.id === sp.ansatt)?.id ?? null;
  const view: "plan" | "uker" = sp.vis === "uker" ? "uker" : "plan";
  const shownStaff = who ? staff.filter((s) => s.id === who) : staff;
  const shownHours = who ? hours.filter((h) => h.staff_id === who) : hours;
  const shownExceptions = who ? exceptions.filter((e) => e.staff_id === who) : exceptions;
  const href = (o: { uke?: number; ansatt?: string | null; vis?: string }) => {
    const q = new URLSearchParams();
    const u = o.uke ?? selected;
    if (u) q.set("uke", String(u));
    const a = o.ansatt === undefined ? who : o.ansatt;
    if (a) q.set("ansatt", a);
    const v = o.vis ?? view;
    if (v !== "plan") q.set("vis", v);
    return `/admin/timelister?${q.toString()}`;
  };
  const chip = (active: boolean) =>
    "act " + (active ? "act-accent ring-1 ring-accent-soft" : "");

  const tab = (idx: number) => {
    const active = idx === selected;
    return (
      <Link
        key={idx}
        href={href({ uke: idx })}
        className={
          "border-b-2 px-4 py-2 text-sm transition-colors " +
          (active
            ? "border-accent-soft font-semibold text-fg"
            : "border-transparent text-muted hover:text-fg")
        }
      >
        {parityLabel(idx)}
      </Link>
    );
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Timelister"
        description="Ukentlig turnus per barber. Ukeplanen styrer også når kunder kan booke den enkelte barberen. Med rotasjon kan du sette ulik turnus for hver uke i mønsteret – tider merket «Hver uke» gjelder alle."
      />

      <RotationControl weeks={weeks} />

      {/* Filter: ansatt + visning */}
      <div className="mb-5 space-y-3 rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold tracking-wide text-muted uppercase">Ansatt</span>
          <Link href={href({ ansatt: null })} className={chip(!who)}>
            Alle
          </Link>
          {staff.map((s) => (
            <Link key={s.id} href={href({ ansatt: s.id })} className={chip(who === s.id)}>
              {s.full_name}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold tracking-wide text-muted uppercase">Visning</span>
          <Link href={href({ vis: "plan" })} className={chip(view === "plan")}>
            Ukeplan
          </Link>
          <Link href={href({ vis: "uker" })} className={chip(view === "uker")}>
            Uke for uke (hele rotasjonen)
          </Link>
        </div>
      </div>

      {view === "uker" ? (
        <TurnusOverview
          hours={shownHours}
          staff={shownStaff}
          weeks={weeks}
          currentIndex={rotation.currentIndex}
        />
      ) : (
      <>
      {weeks > 1 && (
        <div className="mb-4 flex items-center justify-between border-b border-line">
          <div className="flex flex-wrap items-center gap-1">
            {options.map((i) => tab(i))}
          </div>
          <p className="pb-2 text-xs text-muted">
            Denne uken er{" "}
            <strong className="text-accent-soft">
              {parityLabel(rotation.currentIndex)}
            </strong>
          </p>
        </div>
      )}

      <WeekSchedule
        hours={shownHours}
        staff={shownStaff}
        parity={selected}
        weekStart={weekStartFor(selected, rotation.currentIndex, weeks)}
        exceptions={shownExceptions}
        absences={who ? absences.filter((a) => a.staff_id === who) : absences}
      />
      </>
      )}

      <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
        Rediger turnus
      </h2>
      <BulkTurnusForm staff={staff} weeks={weeks} />
      <StaffHoursManager hours={shownHours} staff={shownStaff} weeks={weeks} />

      <div className="mt-10 mb-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
          Avvik &amp; fravær
        </h2>
        <p className="mt-1 text-sm text-muted">
          Overstyr turnusen for enkeltdatoer: fri hele eller deler av dagen, eller
          en ekstravakt. Booking og ledige tider oppdateres automatisk. Ferie og
          annet fravær over flere dager registreres under{" "}
          <Link href="/admin/fravaer" className="text-accent-soft hover:underline">
            Fravær
          </Link>{" "}
          – det blokkerer nå også booking.
        </p>
      </div>
      <StaffExceptionsManager exceptions={exceptions} staff={staff} />

      <div className="mt-10 mb-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
          Blokker booking
        </h2>
        <p className="mt-1 text-sm text-muted">
          Sperr hele eller deler av en dag for booking på{" "}
          <strong>alle ansatte</strong> (helligdag, arrangement, felles fri).
          Blokkerte tider forsvinner fra ledige tider i booking.
        </p>
      </div>
      <BookingBlocksManager blocks={blocks} />
    </div>
  );
}
