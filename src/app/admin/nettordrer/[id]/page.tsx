import { OnlineOrderDetailPage } from "@/components/kasse/OnlineOrdersPage";

export const dynamic = "force-dynamic";

export default async function AdminNettordre({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OnlineOrderDetailPage className="mx-auto max-w-5xl space-y-6" basePath="/admin/nettordrer" id={id} customerBase="/admin/kunder" />;
}
