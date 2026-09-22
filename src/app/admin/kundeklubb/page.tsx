import { getMembershipTiers, getMembershipCounts } from "@/lib/membership-queries";
import { StatTile } from "@/components/ui/StatTile";
import { MembershipTiersEditor } from "@/components/admin/MembershipTiersEditor";

export const dynamic = "force-dynamic";

export default async function AdminKundeklubb() {
  const [tiers, counts] = await Promise.all([getMembershipTiers(), getMembershipCounts()]);
  const countFor = (id: number) => counts.find((c) => c.tierId === id)?.count ?? 0;

  // Høyest først i oversikten (toppnivået til venstre).
  const ordered = [...tiers].sort((a, b) => b.sortOrder - a.sortOrder || b.id - a.id);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Kundeklubb</h1>
        <p className="mt-1 text-sm text-muted">
          Medlemsnivåer utledes automatisk av kundens livstidsforbruk og antall
          fullførte besøk. En kunde får det høyeste nivået der forbruket{" "}
          <em>eller</em> antall besøk er over terskelen. Ingen poeng, ingen manuell
          tildeling. Du kan legge til nye topp-nivåer (f.eks. Platinum), slette
          nivåer og endre rekkefølgen selv — uten hjelp fra utvikler.
        </p>
      </div>

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
