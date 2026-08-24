import { StaffManager } from "@/components/admin/StaffManager";
import { getStaffAdmin } from "@/lib/admin-queries";

export default async function AdminAnsatte() {
  const staff = await getStaffAdmin();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 font-display text-2xl font-bold">Ansatte</h1>
      <StaffManager staff={staff} />
    </div>
  );
}
