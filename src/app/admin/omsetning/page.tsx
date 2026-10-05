import { OmsetningView } from "@/components/admin/OmsetningView";

export const dynamic = "force-dynamic";

export default async function AdminOmsetning({
  searchParams,
}: {
  searchParams: Promise<{ dag?: string; mnd?: string }>;
}) {
  const sp = await searchParams;
  return (
    <OmsetningView
      dag={sp.dag}
      mnd={sp.mnd}
      basePath="/admin/omsetning"
      backHref="/admin/regnskap"
      backLabel="Tilbake til regnskap"
      canVoid
    />
  );
}
