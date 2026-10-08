import { requireRole } from "@/lib/auth";
import { OmsetningRevisorView } from "@/components/revisor/OmsetningRevisorView";

export const dynamic = "force-dynamic";

export default async function RevisorOmsetning({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; mnd?: string; dag?: string; ar?: string; kv?: string }>;
}) {
  await requireRole(["revisor", "admin"]);
  const sp = await searchParams;
  return (
    <OmsetningRevisorView
      periode={sp.periode}
      mnd={sp.mnd}
      dag={sp.dag}
      ar={sp.ar}
      kv={sp.kv}
    />
  );
}
