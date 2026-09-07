import { StaffHoursManager } from "@/components/admin/StaffHoursManager";
import { getStaffHours, getStaffOptions } from "@/lib/ops-queries";

export default async function AdminTimelister() {
  const [hours, staff] = await Promise.all([
    getStaffHours(),
    getStaffOptions(),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 font-display text-2xl font-bold">Timelister</h1>
      <p className="mb-6 text-sm text-muted">
        Ukentlig arbeidstid per ansatt. Styrer når kunder kan booke den enkelte
        barberen.
      </p>
      <StaffHoursManager hours={hours} staff={staff} />
    </div>
  );
}
