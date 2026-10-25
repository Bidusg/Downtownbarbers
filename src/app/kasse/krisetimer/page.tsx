import { PageHeader } from "@/components/ui/PageHeader";
import { CrisisInbox } from "@/components/kasse/CrisisInbox";
import { getCrisisRequests } from "@/lib/crisis-queries";

export const dynamic = "force-dynamic";

export default async function KasseKrisetimer() {
  const { rows, ready } = await getCrisisRequests();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Krisetimer"
        description="Kundeklubb-kunder som trenger time raskt. Ring kunden, finn en luke i kalenderen og book inn – så markerer du forespørselen som booket."
      />
      {!ready ? (
        <p className="bo-card border border-line bg-surface p-5 text-sm text-danger">
          Kjør KJØR-I-SUPABASE-MEDLEMSFORDELER.sql i Supabase først.
        </p>
      ) : (
        <CrisisInbox key={rows.map((r) => r.id + r.status).join(",")} rows={rows} />
      )}
    </div>
  );
}
