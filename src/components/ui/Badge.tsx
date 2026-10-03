import type { ReactNode } from "react";

/**
 * Delt etikett/badge-primitiv. Samler det gjentatte
 * «rounded px-2 py-0.5 text-[11px] font-semibold»-mønsteret med noen få toner,
 * så statuser og typer ser like ut på tvers av admin-sidene.
 */
export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft/15 text-accent-soft",
  success: "bg-accent-soft/15 text-accent-soft",
  warning: "bg-surface-2 text-fg",
  danger: "bg-danger/10 text-danger",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold " +
        TONE[tone] +
        (className ? " " + className : "")
      }
    >
      {children}
    </span>
  );
}
