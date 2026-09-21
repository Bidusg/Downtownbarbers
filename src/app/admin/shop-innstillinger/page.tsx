import { requireRole } from "@/lib/auth";
import { getShopFlags } from "@/lib/shop-settings";
import { ShopSettingsForm } from "@/components/admin/ShopSettingsForm";

export const dynamic = "force-dynamic";

export default async function AdminShopInnstillinger() {
  await requireRole(["admin"]);
  const flags = await getShopFlags();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Shop-innstillinger</h1>
        <p className="mt-1 text-sm text-muted">
          Slå funksjoner i kassa av eller på fra ett sted. Dette gjelder
          kasse-personalet. <strong className="text-fg">Eier (Dawit)</strong> og
          admin omgår alle disse begrensningene – de har alltid full tilgang.
        </p>
      </div>

      <ShopSettingsForm flags={flags} />
    </div>
  );
}
