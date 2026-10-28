/**
 * Vises umiddelbart ved sidebytte mens serveren henter data (streaming), så
 * navigasjonen føles øyeblikkelig i stedet for å «henge» på forrige side.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-6 px-4 py-8 sm:px-6" aria-busy="true" aria-label="Laster …">
      <div className="h-7 w-48 rounded bg-surface-2" />
      <div className="h-4 w-80 max-w-full rounded bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-lg border border-line bg-surface" />
        ))}
      </div>
      <div className="h-64 rounded-lg border border-line bg-surface" />
    </div>
  );
}
