export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border border-line bg-surface p-5">
      <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
        {label}
      </p>
      <p className="mt-3 font-display text-3xl font-bold text-fg">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}
