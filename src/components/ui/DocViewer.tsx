"use client";

import { useCallback, useEffect, useState } from "react";

/* =====================================================================
 * DocViewer – gjenbrukbar popup for å SE et dokument uten å laste det ned.
 *
 *   - PDF: vises nativt i nettleseren via <iframe> mot fil-URL-en.
 *   - Bilder (png/jpg/…): vises inline.
 *   - Excel (.xlsx/.xls): nettleseren kan ikke vise dette nativt, så vi
 *     henter parsede ark fra /api/doc-preview (server-side, exceljs) og
 *     viser dem som tabell(er) med én fane per ark.
 *
 *   Bruk <DocViewerButton/> ved siden av en eksisterende «Last ned»-lenke:
 *     <DocViewerButton filename={d.name} url={d.url} mime={d.mime} />
 *   eller med en lat URL-resolver (f.eks. en signert URL hentet ved klikk):
 *     <DocViewerButton filename={v.title} resolveUrl={() => voucherViewUrl(v.id)} />
 *
 *   Lukkes med X / Escape / klikk utenfor. Degraderer trygt: ved feil vises
 *   «Kunne ikke forhåndsvise, last ned i stedet».
 * ===================================================================== */

export type DocKind = "pdf" | "image" | "excel" | "unknown";

function detectKind(filename?: string | null, mime?: string | null): DocKind {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.startsWith("image/")) return "image";
  if (m.includes("spreadsheet") || m.includes("excel") || m.includes("ms-excel")) {
    return "excel";
  }
  const name = (filename ?? "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"].includes(ext)) {
    return "image";
  }
  if (["xlsx", "xls", "xlsm"].includes(ext)) return "excel";
  return "unknown";
}

type Sheet = { name: string; rows: string[][]; truncated: boolean };

function EyeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/* ---------- Excel-tabell ---------- */

function ExcelPreview({ url }: { url: string }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/doc-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = (await res.json()) as
          | { sheets: Sheet[] }
          | { error: string };
        if (cancelled) return;
        if ("error" in data) {
          setError(data.error);
        } else if (data.sheets?.length) {
          setSheets(data.sheets);
          setActive(0);
        } else {
          setError("Fant ingen data å vise.");
        }
      } catch {
        if (!cancelled) setError("Kunne ikke forhåndsvise regnearket.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <div className="p-6 text-sm text-muted">
        {error} Last ned filen for å åpne den.
      </div>
    );
  }
  if (!sheets) {
    return <div className="p-6 text-sm text-muted">Laster forhåndsvisning …</div>;
  }

  const sheet = sheets[active];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {sheets.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-line bg-surface-2 px-3 py-2">
          {sheets.map((s, i) => (
            <button
              key={s.name + i}
              type="button"
              onClick={() => setActive(i)}
              className={
                "px-3 py-1 text-xs font-semibold transition-colors " +
                (i === active
                  ? "bg-accent text-accent-fg"
                  : "text-muted hover:text-fg")
              }
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {sheet.rows.length === 0 ? (
          <div className="p-6 text-sm text-muted">Tomt ark.</div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <tbody>
              {sheet.rows.map((row, ri) => (
                <tr key={ri} className={ri === 0 ? "bg-surface-2 font-semibold" : ""}>
                  {row.length === 0 ? (
                    <td className="border border-line px-3 py-1.5 text-muted">&nbsp;</td>
                  ) : (
                    row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="whitespace-nowrap border border-line px-3 py-1.5 align-top text-fg"
                      >
                        {cell}
                      </td>
                    ))
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {sheet.truncated && (
        <div className="border-t border-line bg-surface-2 px-3 py-2 text-xs text-muted">
          Viser kun de første radene. Last ned filen for å se alt.
        </div>
      )}
    </div>
  );
}

/* ---------- PDF (via blob) ---------- */

// CSP-en tillater kun `frame-src 'self' blob:` – ikke Supabase-hosten direkte.
// Vi henter derfor PDF-en (signert URL er CORS-vennlig via connect-src) og
// viser den fra en blob:-URL, som er den tiltenkte forhåndsvisnings-måten.
function PdfPreview({ url, filename }: { url: string; filename: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setBlobUrl(created);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
        Kunne ikke forhåndsvise dokumentet. Bruk «Last ned» for å åpne det.
      </div>
    );
  }
  if (!blobUrl) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted">
        Laster forhåndsvisning …
      </div>
    );
  }
  return (
    <iframe
      src={blobUrl}
      title={filename}
      className="h-full w-full border-0 bg-white"
    />
  );
}

/* ---------- Modal ---------- */

export function DocViewer({
  url,
  filename,
  mime,
  kind: kindProp,
  onClose,
}: {
  url: string;
  filename: string;
  mime?: string | null;
  kind?: DocKind;
  onClose: () => void;
}) {
  const kind = kindProp ?? detectKind(filename, mime);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={filename}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-line bg-canvas shadow-2xl">
        {/* Topplinje */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="truncate text-sm font-semibold text-fg" title={filename}>
            {filename}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-accent-soft underline-offset-2 hover:underline"
            >
              Last ned
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Lukk"
              className="text-2xl leading-none text-muted hover:text-fg"
            >
              ×
            </button>
          </div>
        </div>

        {/* Innhold */}
        <div className="min-h-0 flex-1 overflow-hidden bg-surface">
          {kind === "pdf" && (
            <PdfPreview key={url} url={url} filename={filename} />
          )}
          {kind === "image" && (
            <div className="flex h-full w-full items-center justify-center overflow-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={filename}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}
          {kind === "excel" && <ExcelPreview key={url} url={url} />}
          {kind === "unknown" && (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
              Denne filtypen kan ikke forhåndsvises. Bruk «Last ned» for å åpne
              den.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- «Vis»-knapp (øye) ---------- */

export function DocViewerButton({
  filename,
  url,
  resolveUrl,
  mime,
  label = "Vis",
  className = "",
}: {
  filename: string;
  /** Allerede tilgjengelig (inline-visbar) signert URL. */
  url?: string | null;
  /** Lat resolver – hentes ved klikk (f.eks. signert URL fra server action). */
  resolveUrl?: () => Promise<string | null>;
  mime?: string | null;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState<string | null>(url ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = !url && !resolveUrl;

  const onClick = useCallback(async () => {
    setError(null);
    if (url) {
      setResolved(url);
      setOpen(true);
      return;
    }
    if (!resolveUrl) return;
    setBusy(true);
    try {
      const u = await resolveUrl();
      if (u) {
        setResolved(u);
        setOpen(true);
      } else {
        setError("Kunne ikke åpne.");
      }
    } catch {
      setError("Kunne ikke åpne.");
    } finally {
      setBusy(false);
    }
  }, [url, resolveUrl]);

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || busy}
        aria-label={`${label} ${filename}`}
        title={error ?? label}
        className={
          "inline-flex items-center gap-1.5 text-xs font-semibold text-accent-soft underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-40 " +
          className
        }
      >
        <EyeIcon className="h-3.5 w-3.5" />
        {busy ? "Åpner …" : label}
      </button>
      {open && resolved && (
        <DocViewer
          url={resolved}
          filename={filename}
          mime={mime}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
