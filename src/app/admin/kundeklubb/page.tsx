import { getMembershipTiers, getMembershipCounts } from "@/lib/membership-queries";
import { StatTile } from "@/components/ui/StatTile";
import { PageHeader } from "@/components/ui/PageHeader";
import { MembershipTiersEditor } from "@/components/admin/MembershipTiersEditor";

export const dynamic = "force-dynamic";

export default async function AdminKundeklubb() {
  const [tiers, counts] = await Promise.all([getMembershipTiers(), getMembershipCounts()]);
  const countFor = (id: number) => counts.find((c) => c.tierId === id)?.count ?? 0;

  // Høyest først i oversikten (toppnivået til venstre).
  const ordered = [...tiers].sort((a, b) => b.sortOrder - a.sortOrder || b.id - a.id);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Kundeklubb"
        description="Nivået regnes automatisk av kundens aktivitet de siste 12 månedene: fullførte besøk (Fixit-besøk regnet om til et snitt per år fram til oktober 2027) eller forbruk. Kunden får det høyeste nivået der én av tersklene er nådd. Kunder som var Platinum etter gammel regel, beholder Platinum ut 2026. Rabattene trekkes automatisk i kassa når kunden var innlogget da timen ble booket."
      />

      {/* Antall kunder per nivå */}
      <div>
        <h2 className="mb-3 font-display text-lg font-bold">Fordeling</h2>
        {ordered.length === 0 ? (
          <p className="text-sm text-muted">Ingen nivåer definert enda.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ordered.map((t) => (
              <StatTile
                key={t.id}
                label={t.name}
                value={String(countFor(t.id))}
                sub="kunder på nivået"
              />
            ))}
          </div>
        )}
      </div>

      {/* Rediger / legg til / omordne / slett nivåer */}
      <div>
        <h2 className="mb-1 font-display text-lg font-bold">Nivåer og terskler</h2>
        <p className="mb-3 text-xs text-muted">
          Nivåene vises høyest først. Bruk ↑/↓ for å endre rangen — det øverste
          nivået er «best». La det laveste nivået ha 0 kr / 0 besøk, så alle kunder
          alltid havner på et nivå.
        </p>
        <MembershipTiersEditor tiers={tiers} counts={counts} />
      </div>
    </div>
  );
}
