import { StaffManager } from "@/components/admin/StaffManager";
import { PageHeader } from "@/components/ui/PageHeader";
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
      <PageHeader
        title="Ansatte"
        description="Barbere og ansatte – profil, nivå, tjenester og tilgang."
      />
      <StaffManager
        staff={staff}
        levels={levels}
        services={services}
        staffServices={staffServices}
      />
    </div>
  );
}
