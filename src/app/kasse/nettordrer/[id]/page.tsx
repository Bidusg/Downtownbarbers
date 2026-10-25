import { OnlineOrderDetailPage } from "@/components/kasse/OnlineOrdersPage";

export const dynamic = "force-dynamic";

export default async function KasseNettordre({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OnlineOrderDetailPage className="mx-auto max-w-4xl px-4 py-8 sm:px-6" basePath="/kasse/nettordrer" id={id} />;
}
