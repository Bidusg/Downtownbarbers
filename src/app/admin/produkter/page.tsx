import { ProductManager } from "@/components/admin/ProductManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProductsAdmin } from "@/lib/admin-queries";

export default async function AdminProdukter() {
  const products = await getProductsAdmin();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Produkter & nettbutikk" />
      <ProductManager products={products} />
    </div>
  );
}
