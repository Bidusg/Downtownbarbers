import { AbsenceManager } from "@/components/admin/AbsenceManager";
import { LeaveRequestsAdmin } from "@/components/admin/LeaveRequestsAdmin";
import { getAbsences, getStaffOptions, getLeaveRequests } from "@/lib/ops-queries";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function AdminFravaer() {
  const [absences, staff, requests] = await Promise.all([
    getAbsences(),
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
      <AbsenceManager absences={absences} staff={staff} />
    </div>
  );
}
