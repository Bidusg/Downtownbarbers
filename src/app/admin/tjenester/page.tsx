import { ServiceManager } from "@/components/admin/ServiceManager";
import { getServicesAdmin, getCategories } from "@/lib/admin-queries";
import {
  getServiceExclusionsAdmin,
  getActiveStaffForExclusions,
  getServicePopularity,
} from "@/lib/service-catalog-queries";

export default async function AdminTjenester() {
  const [services, categories, staff, exclusions, popularityMap] =
    await Promise.all([
      getServicesAdmin(),
      getCategories(),
      getActiveStaffForExclusions(),
      getServiceExclusionsAdmin(),
      getServicePopularity(90),
    ]);
  const popularity: Record<string, number> = {};
  for (const [id, n] of popularityMap) popularity[id] = n;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 font-display text-2xl font-bold">Tjenester</h1>
      <ServiceManager
        services={services}
        categories={categories}
        staff={staff}
        exclusions={exclusions}
        popularity={popularity}
      />
    </div>
  );
}
