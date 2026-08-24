import { cn } from "@/lib/utils/cn";

type Props = {
  /** 0–100 */
  value: number;
  label?: string;
  /** Tekst til høyre (f.eks. "78 %" eller "14 / 20"). Utelates for ren bar. */
  caption?: string;
  className?: string;
};

/**
 * Fremdriftsbar (0–100 %). Merkevare: skarpe hjørner, #F47721 (accent-soft) som fyll.
 * Brukes for shop-dagsmål og ansatt-månedsmål.
 */
export function ProgressBar({ value, label, caption, className }: Props) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("w-full", className)}>
      {(label || caption) && (
        <div className="mb-1.5 flex items-baseline justify-between">
          {label && <span className="text-sm text-fg">{label}</span>}
          {caption && (
            <span className="font-display text-sm text-muted">{caption}</span>
          )}
        </div>
      )}
      <div
        className="h-2.5 w-full overflow-hidden bg-surface-2"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full bg-accent-soft transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
