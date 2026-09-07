import { CampaignManager } from "@/components/admin/CampaignManager";
import { getCampaigns } from "@/lib/ops-queries";

export default async function AdminKampanjer() {
  const campaigns = await getCampaigns();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 font-display text-2xl font-bold">Kampanjer</h1>
      <p className="mb-6 text-sm text-muted">
        Planlegg SMS- og e-postkampanjer. Selve utsendingen kobles på når
        SMS/e-post-leverandøren er satt opp.
      </p>
      <CampaignManager campaigns={campaigns} />
    </div>
  );
}
