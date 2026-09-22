import { ServiceManager } from "@/components/admin/ServiceManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { getServicesAdmin, getCategories } from "@/lib/admin-queries";
import { getServicePopularity } from "@/lib/service-catalog-queries";

export default async function AdminTjenester() {
  const [services, categories, popularityMap] = await Promise.all([
    getServicesAdmin(),
    getCategories(),
    getServicePopularity(90),
  ]);
  const popularity: Record<string, number> = {};
  for (const [id, n] of popularityMap) popularity[id] = n;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Tjenester" />
      <ServiceManager
        services={services}
        categories={categories}
        popularity={popularity}
      />
    </div>
  );
}
