import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getShopFlags } from "@/lib/shop-settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { ShopSettingsManager } from "@/components/admin/ShopSettingsManager";

export const dynamic = "force-dynamic";

type OwnerUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_owner: boolean;
};

export default async function InnstillingerPage() {
  await requireRole(["admin"]);
  const flags = await getShopFlags();

  const sb = await createClient();
  const { data } = await sb
    .from("profiles")
    .select("id, full_name, email, role, is_owner")
    .in("role", ["admin", "shop"])
    .order("full_name", { ascending: true });
  const users = (data ?? []) as OwnerUser[];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Shop-innstillinger"
        description="Skru funksjoner i kassen av og på hvis de misbrukes. En eier omgår begrensningene."
      />
      <ShopSettingsManager flags={flags} users={users} />
    </div>
  );
}
