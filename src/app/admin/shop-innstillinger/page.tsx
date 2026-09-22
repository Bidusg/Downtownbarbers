import { requireRole } from "@/lib/auth";
import { getShopFlags } from "@/lib/shop-settings";
import { ShopSettingsForm } from "@/components/admin/ShopSettingsForm";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function AdminShopInnstillinger() {
  await requireRole(["admin"]);
  const flags = await getShopFlags();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title="Shop-innstillinger"
        description="Slå funksjoner i kassa av eller på fra ett sted. Dette gjelder kasse-personalet. Eier (Dawit) og admin omgår alle disse begrensningene – de har alltid full tilgang."
      />

      <ShopSettingsForm flags={flags} />
    </div>
  );
}
