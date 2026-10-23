"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  uploadPortfolioImage,
  deletePortfolioImage,
  movePortfolioImage,
} from "@/app/admin/ansatte/portefolje/actions";
import type { PortfolioImage } from "@/lib/portfolio";

/** Skaler ned i nettleseren (maks 1600 px, JPEG) – raskere opplasting og e-post. */
async function downscale(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const max = 1600;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k);
    const h = Math.round(bmp.height * k);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")?.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.84));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function PortfolioManager({
  staffId,
  staffName,
  publicUrl,
  images,
}: {
  staffId: string;
  staffName: string;
  publicUrl: string;
  images: PortfolioImage[];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setErr(null);
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    for (let i = 0; i < list.length; i++) {
      setProgress(`Laster opp ${i + 1} av ${list.length} …`);
      const blob = await downscale(list[i]);
      const fd = new FormData();
      fd.set("image", new File([blob], "bilde.jpg", { type: blob.type || "image/jpeg" }));
      const r = await uploadPortfolioImage(staffId, fd);
      if (r.error) {
        setErr(r.error);
        break;
      }
    }
    setProgress(null);
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  const act = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.error) setErr(r.error);
      router.refresh();
    });

  return (
    <div className="bo-card space-y-5 border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{staffName}</h2>
          <p className="text-sm text-muted">
            {images.length} bilde{images.length === 1 ? "" : "r"} ·{" "}
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-accent-soft underline-offset-2 hover:underline">
              Se siden kundene ser ↗
            </a>
          </p>
        </div>
        <label className={"act act-accent cursor-pointer " + (busy ? "pointer-events-none opacity-60" : "")}>
          {busy ? progress ?? "Laster opp …" : "Legg til bilder"}
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>
      </div>

      {err && (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {err}
        </p>
      )}

      {images.length === 0 ? (
        <p className="rounded-xl bg-surface-2 px-4 py-8 text-center text-sm text-muted">
          Ingen bilder ennå. Velg flere bilder på en gang – de skaleres ned automatisk.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.id} className="overflow-hidden rounded-xl border border-line bg-canvas">
              <div className="relative aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={`Bilde ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                {i < 4 && (
                  <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
                    I e-post
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 p-1.5">
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-label="Flytt frem"
                    disabled={pending || i === 0}
                    onClick={() => act(() => movePortfolioImage(img.id, -1))}
                    className="x-btn disabled:opacity-30"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label="Flytt bak"
                    disabled={pending || i === images.length - 1}
                    onClick={() => act(() => movePortfolioImage(img.id, 1))}
                    className="x-btn disabled:opacity-30"
                  >
                    →
                  </button>
                </div>
                {confirmId === img.id ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setConfirmId(null);
                      act(() => deletePortfolioImage(img.id));
                    }}
                    className="rounded-lg bg-danger px-3 py-2 text-xs font-semibold text-white"
                  >
                    Ja, slett
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setConfirmId(img.id)}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-danger hover:bg-danger/10"
                  >
                    Slett
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">De fire første bildene brukes i e-poster. Bruk pilene for å bestemme rekkefølgen.</p>
    </div>
  );
}
