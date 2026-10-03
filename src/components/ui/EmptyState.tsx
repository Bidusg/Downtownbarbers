import type { ReactNode } from "react";

/**
 * Delt tom-tilstand: en rolig, innrammet melding når en liste/seksjon ikke har
 * data ennå. Samler «border + prikk + tekst»-mønsteret ett sted, så alle tomme
 * tilstander ser like ut. Valgfri tittel, beskrivelse og handling.
 */
export function EmptyState({
  title,
  description,
  action,
  className = "",
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "flex items-start gap-3 border border-accent-soft/30 bg-accent-soft/5 px-4 py-3 text-sm " +
        className
      }
    >
      <span className="mt-0.5 text-accent-soft" aria-hidden>
        ●
      </span>
      <div className="min-w-0 space-y-1">
        <p className="text-muted">
          {title && <strong className="text-fg">{title}</strong>}
          {title && description ? " — " : null}
          {description}
        </p>
        {action && <div className="pt-1">{action}</div>}
      </div>
    </div>
  );
}
