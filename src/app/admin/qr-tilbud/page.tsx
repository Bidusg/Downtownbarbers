import { getAdminPromos } from "@/lib/promo-admin-queries";
import { PromoManager } from "@/components/admin/PromoManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function AdminQrTilbud() {
  const promos = await getAdminPromos();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="QR-tilbud"
        description="Skjulte tilbud for arrangementer og samarbeid. Tilbudet gjelder bare for dem som skanner QR-koden – det ligger ikke åpent på nettsiden. Rabatten legges på bookingen og nettbutikken automatisk og trekkes i kassa."
      />
      {promos === null ? (
        <p className="border border-line bg-surface p-4 text-sm text-muted">
          Kjør <span className="font-mono text-fg">KJØR-I-SUPABASE-QR-TILBUD.sql</span> i Supabase først.
        </p>
      ) : (
        <PromoManager promos={promos} />
      )}
    </div>
  );
}
