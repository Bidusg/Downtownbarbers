import { barberGoals } from "@/lib/data/mock";

const comments = [
  { barber: "David", stars: 5, text: "Beste fade i Oslo, som alltid.", when: "2 dager siden" },
  { barber: "Soren", stars: 5, text: "Superfornøyd med skjegget.", when: "3 dager siden" },
  { barber: "Vani", stars: 4, text: "Bra klipp, litt ventetid.", when: "5 dager siden" },
  { barber: "Stavros", stars: 5, text: "Rolig og presis. Anbefales.", when: "1 uke siden" },
];

function Stars({ n }: { n: number }) {
  return (
    <span className="text-accent-soft">
      {"★".repeat(n)}
      <span className="text-line-2">{"★".repeat(5 - n)}</span>
    </span>
  );
}

export default function AdminRating() {
  const sorted = [...barberGoals].sort((a, b) => b.rating - a.rating);
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <h1 className="font-display text-2xl font-bold">Rating & tilbakemeldinger</h1>

      <div className="border border-line bg-surface p-6">
        <h2 className="mb-5 font-display text-lg font-bold">Snittrating per barber</h2>
        <div className="space-y-4">
          {sorted.map((b) => (
            <div key={b.name} className="flex items-center gap-4">
              <span className="w-28 text-sm font-medium text-fg">{b.name}</span>
              <div className="h-2 flex-1 overflow-hidden bg-surface-2">
                <div
                  className="h-full bg-accent-soft"
                  style={{ width: `${(b.rating / 5) * 100}%` }}
                />
              </div>
              <span className="w-24 text-right font-display text-sm">
                {b.rating.toFixed(1).replace(".", ",")} <span className="text-accent-soft">★</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-line bg-surface p-6">
        <h2 className="mb-5 font-display text-lg font-bold">Siste tilbakemeldinger</h2>
        <ul className="divide-y divide-line">
          {comments.map((c, i) => (
            <li key={i} className="flex items-start justify-between gap-4 py-4">
              <div>
                <p className="text-sm text-fg">{c.text}</p>
                <p className="mt-1 text-xs text-muted">{c.barber}</p>
              </div>
              <div className="text-right">
                <Stars n={c.stars} />
                <p className="mt-1 text-xs text-muted">{c.when}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted">
        Ekte ratinger samles inn når kunder vurderer etter fullført time.
      </p>
    </div>
  );
}
