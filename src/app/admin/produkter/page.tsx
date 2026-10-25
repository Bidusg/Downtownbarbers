import { ProductManager } from "@/components/admin/ProductManager";
import { WebshopSettingsCard } from "@/components/admin/WebshopAdmin";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProductsAdmin } from "@/lib/admin-queries";
import { getWebshopSettings } from "@/lib/shop";

export default async function AdminProdukter() {
  const [products, settings] = await Promise.all([getProductsAdmin(), getWebshopSettings()]);
  const hasWeb = products.some((p) => p.slug !== undefined);
  const items = products.filter((p) => !p.is_gift_card && p.active);
  const stats = {
    online: items.filter((p) => p.slug && p.online !== false).length,
    noImage: items.filter((p) => !(p.images ?? []).length && !p.image_url).length,
    review: items.filter((p) => p.content_review).length,
    external: items.filter((p) => [...(p.images ?? []), p.image_url ?? ""].some((u) => /^https:\/\/res\.cloudinary\.com\//.test(u))).length,
  };
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Produkter & nettbutikk" />
      {hasWeb ? (
        <WebshopSettingsCard settings={settings} stats={stats} />
      ) : (
        <p className="bo-card border border-line bg-surface p-5 text-sm text-danger">
          Kjør KJØR-I-SUPABASE-NETTBUTIKK.sql i Supabase for å slå på nettbutikken (tekster, bilder og bestilling).
        </p>
      )}
      <ProductManager products={products} />
    </div>
  );
}
