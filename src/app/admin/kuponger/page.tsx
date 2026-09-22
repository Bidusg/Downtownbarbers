import { getMemberCampaigns } from "@/lib/campaigns-queries";
import { getMembershipTiers } from "@/lib/membership-queries";
import { CampaignManager } from "@/components/admin/CampaignManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function AdminKuponger() {
  const [campaigns, tiers] = await Promise.all([
    getMemberCampaigns(),
    getMembershipTiers(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Sesong-kuponger"
        description="Utsted tidsavgrensede rabatter til klubbmedlemmer — f.eks. −20% i august til alle medlemmer, eller et fast avslag kun til Gull og oppover. Kupongen velges på kunden i kassa; rabatten beregnes og valideres automatisk ved betaling."
      />

      <CampaignManager campaigns={campaigns} tiers={tiers} />
    </div>
  );
}
