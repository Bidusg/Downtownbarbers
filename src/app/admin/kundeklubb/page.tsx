import { getMembershipTiers, getMembershipCounts } from "@/lib/membership-queries";
import { TierBadge } from "@/components/membership/TierBadge";
import { StatTile } from "@/components/ui/StatTile";
import { saveTier } from "./actions";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent-soft";

export default async function AdminKundeklubb() {
  const [tiers, counts] = await Promise.all([getMembershipTiers(), getMembershipCounts()]);
  const countFor = (id: number) => counts.find((c) => c.tierId === id)?.count ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Kundeklubb</h1>
        <p className="mt-1 text-sm text-muted">
          Medlemsnivåer utledes automatisk av kundens livstidsforbruk og antall
          fullførte besøk. En kunde får det høyeste nivået der forbruket{" "}
          <em>eller</em> antall besøk er over terskelen. Ingen poeng, ingen manuell
          tildeling.
        </p>
      </div>

      {/* Antall kunder per nivå */}
      <div>
        <h2 className="mb-3 font-display text-lg font-bold">Fordeling</h2>
        {tiers.length === 0 ? (
          <p className="text-sm text-muted">Ingen nivåer definert enda.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {tiers.map((t) => (
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

      {/* Rediger terskler / goder */}
      <div>
        <h2 className="mb-3 font-display text-lg font-bold">Nivåer og terskler</h2>
        <div className="space-y-4">
          {tiers.map((t) => (
            <form
              key={t.id}
              action={saveTier}
              className="border border-line bg-surface p-5"
            >
              <input type="hidden" name="id" value={t.id} />
              <div className="mb-4 flex items-center justify-between">
                <TierBadge name={t.name} color={t.color} />
                <span className="text-xs text-muted">Nivå {t.id}</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-muted">
                  Navn
                  <input name="name" defaultValue={t.name} className={`mt-1 ${inputCls}`} />
                </label>
                <label className="text-xs text-muted">
                  Farge (hex)
                  <input
                    name="color"
                    defaultValue={t.color ?? ""}
                    placeholder="#CD7F32"
                    className={`mt-1 ${inputCls}`}
                  />
                </label>
                <label className="text-xs text-muted">
                  Min. forbruk (kr, livstid)
                  <input
                    name="min_spend"
                    type="number"
                    min={0}
                    step={100}
                    defaultValue={t.minSpend}
                    className={`mt-1 ${inputCls}`}
                  />
                </label>
                <label className="text-xs text-muted">
                  Min. fullførte besøk
                  <input
                    name="min_visits"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={t.minVisits}
                    className={`mt-1 ${inputCls}`}
                  />
                </label>
                <label className="text-xs text-muted sm:col-span-2">
                  Medlemsgode
                  <input
                    name="benefit"
                    defaultValue={t.benefit ?? ""}
                    placeholder="Fritekst — vises til kunden på «min side»"
                    className={`mt-1 ${inputCls}`}
                  />
                </label>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="submit"
                  className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
                >
                  Lagre nivå
                </button>
                <span className="text-xs text-muted">
                  Terskel: {t.minSpend.toLocaleString("nb-NO")} kr eller {t.minVisits} besøk
                </span>
              </div>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
