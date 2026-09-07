import { AbsenceManager } from "@/components/admin/AbsenceManager";
import { getAbsences, getStaffOptions } from "@/lib/ops-queries";

export default async function AdminFravaer() {
  const [absences, staff] = await Promise.all([
    getAbsences(),
    getStaffOptions(),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 font-display text-2xl font-bold">Fravær</h1>
      <p className="mb-6 text-sm text-muted">
        Registrer ferie, sykdom og annet fravær per ansatt.
      </p>
      <AbsenceManager absences={absences} staff={staff} />
    </div>
  );
}
