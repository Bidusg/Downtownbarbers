import type { ReactNode } from "react";

/**
 * Standard sidetopp for admin/revisor/ansatt: tittel, valgfri beskrivelse og
 * valgfrie handlingsknapper til høyre. Gir alle sider samme rytme og hierarki.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold text-fg">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
