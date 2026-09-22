import { getMemberCampaigns } from "@/lib/campaigns-queries";
import { getMembershipTiers } from "@/lib/membership-queries";
import { CampaignManager } from "@/components/admin/CampaignManager";

export const dynamic = "force-dynamic";

export default async function AdminKuponger() {
  const [campaigns, tiers] = await Promise.all([
    getMemberCampaigns(),
    getMembershipTiers(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Sesong-kuponger</h1>
        <p className="mt-1 text-sm text-muted">
          Utsted tidsavgrensede rabatter til klubbmedlemmer — f.eks. −20% i
          august til alle medlemmer, eller et fast avslag kun til Gull og oppover.
          Kupongen velges på kunden i kassa; rabatten beregnes og valideres
          automatisk ved betaling.
        </p>
      </div>

      <CampaignManager campaigns={campaigns} tiers={tiers} />
    </div>
  );
}
