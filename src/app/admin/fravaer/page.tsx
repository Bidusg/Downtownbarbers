import { AbsenceManager } from "@/components/admin/AbsenceManager";
import { LeaveRequestsAdmin } from "@/components/admin/LeaveRequestsAdmin";
import { getAbsences, getStaffOptions, getLeaveRequests } from "@/lib/ops-queries";

export const dynamic = "force-dynamic";

export default async function AdminFravaer() {
  const [absences, staff, requests] = await Promise.all([
    getAbsences(),
    getStaffOptions(),
    getLeaveRequests(),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 font-display text-2xl font-bold">Fravær</h1>
      <p className="mb-6 text-sm text-muted">
        Behandle fri-søknader og registrer ferie, sykdom og annet fravær per
        ansatt.
      </p>
      <LeaveRequestsAdmin requests={requests} />
      <AbsenceManager absences={absences} staff={staff} />
    </div>
  );
}
