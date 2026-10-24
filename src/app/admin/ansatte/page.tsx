import { StaffManager } from "@/components/admin/StaffManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { getStaffAdmin, getStaffWebOrder } from "@/lib/admin-queries";
import { StaffWebOrder } from "@/components/admin/StaffWebOrder";
import {
  getLevels,
  getServicesForPicker,
  getStaffServiceMap,
} from "@/lib/levels-queries";

export default async function AdminAnsatte() {
  const [staff, levels, services, staffServices, webOrder] = await Promise.all([
    getStaffAdmin(),
    getLevels(),
    getServicesForPicker(),
    getStaffServiceMap(),
    getStaffWebOrder(),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Ansatte"
        description="Barbere og ansatte – profil, nivå, tjenester og tilgang."
      />
      <StaffWebOrder
        key={webOrder.rows.map((r) => r.id).join(",")}
        rows={webOrder.rows}
        ready={webOrder.ready}
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
