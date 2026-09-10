import { requireRole } from "@/lib/auth";
import { OmsetningView } from "@/components/admin/OmsetningView";

export const dynamic = "force-dynamic";

export default async function RevisorOmsetning({
  searchParams,
}: {
  searchParams: Promise<{ dag?: string; mnd?: string }>;
}) {
  await requireRole(["revisor", "admin"]);
  const sp = await searchParams;
  return (
    <OmsetningView
      dag={sp.dag}
      mnd={sp.mnd}
      basePath="/revisor/omsetning"
      backHref="/revisor"
      backLabel="Tilbake til oversikt"
    />
  );
}
