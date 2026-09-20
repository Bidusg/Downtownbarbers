"use client";

import { useRef, useState } from "react";

/**
 * Norsk, stylet fil-velger. Skjuler den native «Choose File / No file chosen»
 * (som alltid vises på nettleserens språk) og viser i stedet en knapp +
 * filnavn på norsk. Beholder name/type/accept, så FormData-innsending virker
 * nøyaktig som et vanlig <input type="file">.
 */
export function FileInput({
  name,
  accept,
  buttonLabel = "Velg fil",
  emptyLabel = "Ingen fil valgt",
}: {
  name: string;
  accept?: string;
  buttonLabel?: string;
  emptyLabel?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="mt-1 flex items-center gap-2">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="shrink-0 border border-line-2 bg-canvas px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-surface-2"
      >
        {buttonLabel}
      </button>
      <span className="min-w-0 flex-1 truncate text-xs text-muted" title={fileName ?? undefined}>
        {fileName ?? emptyLabel}
      </span>
      <input
        ref={ref}
        name={name}
        type="file"
        accept={accept}
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        className="sr-only"
      />
    </div>
  );
}
