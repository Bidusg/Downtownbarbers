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
    <div className="bo-tile border border-line bg-surface p-5">
      <p className="text-[13px] font-medium text-muted">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-fg tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}
