"use client";

import { useState } from "react";

/**
 * Live forhåndsvisning av forsiden i admin. Viser den faktiske forsiden i
 * en ramme, i forhåndsvisningsmodus (?preview=1) slik at også skjulte bilder
 * er med. Trykk «Oppdater» etter at du har lagret for å se endringene.
 */
export function SitePreview() {
  const [nonce, setNonce] = useState(0);
  const src = `/?preview=1&t=${nonce}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          Viser forsiden slik den blir – inkludert skjulte bilder du ikke har
          publisert enda.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            className="border border-line-2 px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:border-accent-soft"
          >
            Oppdater
          </button>
          <a
            href="/?preview=1"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-accent-soft hover:underline"
          >
            Åpne i ny fane ↗
          </a>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <iframe
          key={nonce}
          src={src}
          title="Forhåndsvisning av forsiden"
          className="h-[70vh] w-full"
        />
      </div>
    </div>
  );
}
