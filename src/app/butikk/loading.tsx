/** Vises med en gang ved sidebytte i butikken, mens produktene hentes. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-5 pt-8 pb-24" aria-busy="true" aria-label="Laster …">
      <div className="h-8 w-56 rounded-full bg-surface" />
      <div className="mt-3 h-4 w-80 max-w-full rounded-full bg-surface" />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i}>
            <div className="aspect-square rounded-2xl bg-surface" />
            <div className="mt-3 h-4 w-3/4 rounded-full bg-surface" />
            <div className="mt-2 h-4 w-1/3 rounded-full bg-surface" />
          </div>
        ))}
      </div>
    </div>
  );
}
