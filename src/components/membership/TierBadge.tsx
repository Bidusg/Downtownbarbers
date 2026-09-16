/**
 * Nivå-merke for kundeklubben. Presentasjonelt og delt av admin-kundekort og
 * kundens «min side». Fargen kommer fra membership_tiers.color (fri hex), med
 * trygg fallback til aksentfargen om den mangler.
 */
export function TierBadge({
  name,
  color,
  size = "md",
}: {
  name: string;
  color?: string | null;
  size?: "sm" | "md";
}) {
  const safe = color && /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : undefined;
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs";
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide " +
        pad
      }
      style={{
        borderColor: safe ? `${safe}66` : "var(--color-line-2, #444)",
        backgroundColor: safe ? `${safe}1f` : "var(--color-surface-2, #222)",
        color: safe ?? "inherit",
      }}
    >
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: safe ?? "currentColor" }}
      />
      {name}
    </span>
  );
}
