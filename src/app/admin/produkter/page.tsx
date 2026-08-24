import { ProductManager } from "@/components/admin/ProductManager";
import { getProductsAdmin } from "@/lib/admin-queries";

export default async function AdminProdukter() {
  const products = await getProductsAdmin();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 font-display text-2xl font-bold">Produkter & nettbutikk</h1>
      <ProductManager products={products} />
    </div>
  );
}
