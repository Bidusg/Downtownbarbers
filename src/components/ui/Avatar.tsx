import { customerColor, initials } from "@/lib/colors";

/** Farget initial-avatar – konsistent farge per kunde. */
export function Avatar({
  name,
  colorKey,
  size = 28,
}: {
  name: string;
  colorKey?: string;
  size?: number;
}) {
  const color = customerColor(colorKey || name);
  return (
    <span
      aria-hidden
      style={{
        background: color,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
      }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[#211E1A]"
    >
      {initials(name)}
    </span>
  );
}
