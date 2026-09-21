import type { ReactNode } from "react";

/**
 * Delt kort/panel: ramme + overflate, valgfri tittel-topp. Samler det gjentatte
 * «border border-line bg-surface»-mønsteret ett sted, så paneler ser like ut.
 */
export function Card({
  children,
  className = "",
  title,
  actions,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  /** Valgfri tittel-rad øverst i kortet. */
  title?: string;
  /** Valgfrie handlinger til høyre i tittel-raden. */
  actions?: ReactNode;
  /** Innvendig luft (av for tabeller som skal gå kant-i-kant). */
  padded?: boolean;
}) {
  return (
    <div className={"border border-line bg-surface " + className}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
          {title && (
            <span className="text-xs font-semibold tracking-wide text-muted uppercase">
              {title}
            </span>
          )}
          {actions}
        </div>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </div>
  );
}
