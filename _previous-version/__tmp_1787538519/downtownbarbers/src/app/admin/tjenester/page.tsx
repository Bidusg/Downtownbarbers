import { ServiceManager } from "@/components/admin/ServiceManager";
import { getServicesAdmin, getCategories } from "@/lib/admin-queries";

export default async function AdminTjenester() {
  const [services, categories] = await Promise.all([
    getServicesAdmin(),
    getCategories(),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 font-display text-2xl font-bold">Tjenester</h1>
      <ServiceManager services={services} categories={categories} />
    </div>
  );
}
