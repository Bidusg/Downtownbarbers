import { AbsenceManager } from "@/components/admin/AbsenceManager";
import { LeaveRequestsAdmin } from "@/components/admin/LeaveRequestsAdmin";
import { getAbsences, getDaysOff, getStaffOptions, getLeaveRequests } from "@/lib/ops-queries";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function AdminFravaer() {
  const [absences, daysOff, staff, requests] = await Promise.all([
    getAbsences(),
    getDaysOff(),
    getStaffOptions(),
    getLeaveRequests(),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Fravær"
        description="Behandle fri-søknader og registrer ferie, sykdom og annet fravær per ansatt."
      />
      <LeaveRequestsAdmin requests={requests} />
      <AbsenceManager absences={absences} daysOff={daysOff} staff={staff} />
    </div>
  );
}
