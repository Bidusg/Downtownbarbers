import {
  getMyStaffLink,
  getMyAbsences,
  getMyExceptions,
  getMyLeaveRequests,
  type LeaveStatus,
} from "@/lib/ansatt-queries";
import { LeaveRequestForm } from "@/components/ansatt/LeaveRequestForm";
import { WithdrawLeaveButton } from "@/components/ansatt/WithdrawLeaveButton";

export const dynamic = "force-dynamic";

function fmtDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

const STATUS: Record<LeaveStatus, { label: string; cls: string }> = {
  pending: {
    label: "Til behandling",
    cls: "bg-accent-soft/15 text-accent-soft",
  },
  approved: { label: "Godkjent", cls: "bg-accent-soft/15 text-accent-soft" },
  declined: { label: "Avslått", cls: "bg-danger/10 text-danger" },
};

const KIND: Record<string, string> = {
  ferie: "Ferie",
  avspasering: "Avspasering",
  annet: "Annet",
};

export default async function AnsattFravaer() {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Oslo",
  });

  const [link, absences, exceptions, requests] = await Promise.all([
    getMyStaffLink(),
    getMyAbsences(today),
    getMyExceptions(today),
    getMyLeaveRequests(),
  ]);

  // Kun heldags / delvis fri (ikke ekstravakter) regnes som "fravær".
  const offExceptions = exceptions.filter((e) => e.kind === "off");

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="font-display text-xl font-bold">Mine fravær</h1>
        <p className="mt-1 text-sm text-muted">
          Registrert fravær og fri – og en søknad hvis du trenger mer.
        </p>
      </div>

      {!link.linked ? (
        <div className="border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
          Kontoen din er ikke koblet til en ansattprofil enda. Be admin sette
          e-posten din på din ansatt-rad, så vises fraværet ditt her.
        </div>
      ) : (
        <>
          {/* Søk fri */}
          <section className="border border-line bg-surface p-5">
            <LeaveRequestForm />
          </section>

          {/* Mine søknader */}
          <section>
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
              Mine søknader
            </h2>
            {requests.length === 0 ? (
              <div className="border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
                Ingen søknader sendt.
              </div>
            ) : (
              <ul className="divide-y divide-line border border-line bg-surface">
                {requests.map((r) => {
                  const st = STATUS[r.status];
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
                    >
                      <span className="text-fg">
                        {fmtDate(r.from_date)}
                        {r.to_date !== r.from_date
                          ? ` – ${fmtDate(r.to_date)}`
                          : ""}
                      </span>
                      <span className="text-muted">
                        {KIND[r.kind] ?? r.kind}
                      </span>
                      <span
                        className={
                          "ml-auto rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                          st.cls
                        }
                      >
                        {st.label}
                      </span>
                      {r.status === "pending" && (
                        <WithdrawLeaveButton id={r.id} />
                      )}
                      {r.note && (
                        <span className="w-full text-xs text-muted">
                          {r.note}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Registrert fravær (ferie/fri lagt inn av admin) */}
          <section>
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
              Registrert fravær
            </h2>
            {absences.length === 0 && offExceptions.length === 0 ? (
              <div className="border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
                Ingen kommende fravær registrert.
              </div>
            ) : (
              <ul className="divide-y divide-line border border-line bg-surface">
                {absences.map((a) => (
                  <li
                    key={`abs-${a.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
                  >
                    <span className="text-fg">
                      {fmtDate(a.from_date)}
                      {a.to_date !== a.from_date
                        ? ` – ${fmtDate(a.to_date)}`
                        : ""}
                    </span>
                    <span className="rounded bg-danger/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger">
                      Fravær
                    </span>
                    {a.reason && (
                      <span className="text-xs text-muted">{a.reason}</span>
                    )}
                  </li>
                ))}
                {offExceptions.map((e) => {
                  const full = !e.start_time;
                  return (
                    <li
                      key={`exc-${e.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
                    >
                      <span className="text-fg">{fmtDate(e.date)}</span>
                      <span className="rounded bg-danger/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger">
                        {full ? "Fri hele dagen" : "Fri"}
                      </span>
                      {!full && e.start_time && e.end_time && (
                        <span className="font-display text-muted">
                          {e.start_time}–{e.end_time}
                        </span>
                      )}
                      {e.note && (
                        <span className="text-xs text-muted">{e.note}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-muted">
              Registrert fravær legges inn av admin. Bruk «Søk fri» over for å be
              om nytt fravær.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
