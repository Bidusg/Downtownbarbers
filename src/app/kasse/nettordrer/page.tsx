import { OnlineOrdersPage } from "@/components/kasse/OnlineOrdersPage";

export const dynamic = "force-dynamic";

export default async function KasseNettordrer({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <OnlineOrdersPage className="mx-auto max-w-4xl px-4 py-8 sm:px-6" basePath="/kasse/nettordrer" search={q ?? ""} />;
}
