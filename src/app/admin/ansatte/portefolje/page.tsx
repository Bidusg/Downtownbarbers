import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { getStaffOptions } from "@/lib/ops-queries";
import { getPortfolio, barberSlug } from "@/lib/portfolio";
import { PortfolioManager } from "@/components/admin/PortfolioManager";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPortefolje({ searchParams }: { searchParams: Promise<{ ansatt?: string }> }) {
  const sp = await searchParams;
  const staff = await getStaffOptions();
  const selected = staff.find((s) => s.id === sp.ansatt) ?? staff[0] ?? null;
  const images = selected ? await getPortfolio(selected.id) : [];
  // Barbersiden bruker visningsnavnet (f.eks. «Toni») i adressen.
  let display = selected?.full_name ?? "";
  if (selected) {
    try {
      const sb = await createClient();
      const { data } = await sb.from("staff").select("display_name").eq("id", selected.id).maybeSingle();
      display = ((data as { display_name?: string | null } | null)?.display_name || "").trim() || display;
    } catch {
      /* fullt navn */
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Bilder av arbeidet"
        description="Last opp bilder av klipp per barber. De vises på barberens egen side med sveipbar karusell, og i e-poster der barberen er fremhevet (de fire første bildene)."
      />

      <div className="flex flex-wrap gap-2">
        {staff.map((s) => (
          <Link
            key={s.id}
            href={`/admin/ansatte/portefolje?ansatt=${s.id}`}
            className={"act " + (selected?.id === s.id ? "act-accent ring-1 ring-accent-soft" : "")}
          >
            {s.full_name}
          </Link>
        ))}
      </div>

      {selected ? (
        <PortfolioManager
          staffId={selected.id}
          staffName={selected.full_name}
          publicUrl={`/barbere/${barberSlug(display)}`}
          images={images}
        />
      ) : (
        <p className="text-sm text-muted">Ingen aktive ansatte.</p>
      )}
    </div>
  );
}
