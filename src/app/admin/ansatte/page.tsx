import { StaffManager } from "@/components/admin/StaffManager";
import { getStaffAdmin } from "@/lib/admin-queries";
import {
  getLevels,
  getServicesForPicker,
  getStaffServiceMap,
} from "@/lib/levels-queries";

export default async function AdminAnsatte() {
  const [staff, levels, services, staffServices] = await Promise.all([
    getStaffAdmin(),
    getLevels(),
    getServicesForPicker(),
    getStaffServiceMap(),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 font-display text-2xl font-bold">Ansatte</h1>
      <StaffManager
        staff={staff}
        levels={levels}
        services={services}
        staffServices={staffServices}
      />
    </div>
  );
}
