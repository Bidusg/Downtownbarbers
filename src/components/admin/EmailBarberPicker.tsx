"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Select } from "@/components/ui/Input";
import { listPortfolio, uploadPortfolioImage, deletePortfolioImage } from "@/app/admin/ansatte/portefolje/actions";

/** Skaler ned i nettleseren (maks 1600 px, JPEG). */
async function downscale(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
    return (await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.84))) ?? file;
  } catch {
    return file;
  }
}

/**
 * Type e-post + fremhevet barber + bildene som kommer med i e-posten.
 * Bildene lagres som «Bilder av arbeidet» på barberen (gjenbrukes på
 * barbersiden og i senere e-poster). De fire første vises i e-posten.
 */
export function EmailBarberPicker({ staff }: { staff: { id: string; name: string; title: string | null }[] }) {
  const [type, setType] = useState("standard");
  const [barber, setBarber] = useState("");
  const [images, setImages] = useState<{ id: string; url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const sel = staff.find((s) => s.name === barber) ?? null;

  useEffect(() => {
    if (!sel) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- henter bilder når barber byttes
    setLoading(true);
    listPortfolio(sel.id)
      .then((r) => alive && setImages(r))
      .catch(() => alive && setImages([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [sel]);

  async function onFiles(files: FileList | null) {
    if (!sel || !files?.length) return;
    setMsg(null);
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    for (let i = 0; i < list.length; i++) {
      setBusy(`Laster opp ${i + 1} av ${list.length} …`);
      const blob = await downscale(list[i]);
      const fd = new FormData();
      fd.set("image", new File([blob], "bilde.jpg", { type: blob.type || "image/jpeg" }));
      const r = await uploadPortfolioImage(sel.id, fd);
      if (r.error) {
        setMsg(r.error);
        break;
      }
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
    setImages(await listPortfolio(sel.id));
  }

  const showImages = type === "ny_barber" && !!sel;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted">Type e-post</label>
          <Select name="email_type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="standard">Standard</option>
            <option value="ny_barber">Ny barber (bilde, bilder av arbeidet + «Bestill time hos …»)</option>
            <option value="kampanje">Kampanje / tilbud</option>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">
            Fremhevet barber <span className="text-muted/70">(for «Ny barber»)</span>
          </label>
          <Select name="featured_barber" value={barber} onChange={(e) => setBarber(e.target.value)}>
            <option value="">— ingen —</option>
            {staff.map((b) => (
              <option key={b.id} value={b.name}>
                {b.name}
                {b.title ? ` · ${b.title}` : ""}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {type === "ny_barber" && !sel && (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-muted">
          Velg barberen over for å legge til bilder av arbeidet i e-posten.
        </p>
      )}

      {showImages && sel && (
        <div className="rounded-xl border border-line bg-canvas p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-fg">Bilder av arbeidet til {sel.name.split(" ")[0]}</p>
              <p className="text-xs text-muted">
                De fire første vises i e-posten. Alle vises i karusellen på barbersiden.
              </p>
            </div>
            <label className={"act act-accent cursor-pointer " + (busy ? "pointer-events-none opacity-60" : "")}>
              {busy ?? "Legg til bilder"}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => onFiles(e.target.files)}
              />
            </label>
          </div>

          {msg && (
            <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">
              {msg}
            </p>
          )}

          {loading ? (
            <p className="mt-3 text-sm text-muted">Henter bilder …</p>
          ) : images.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Ingen bilder ennå – trykk «Legg til bilder».</p>
          ) : (
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {images.map((img, i) => (
                <li key={img.id} className="group relative overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={`Bilde ${i + 1}`}
                    className={"aspect-square w-full object-cover " + (i >= 4 ? "opacity-50" : "")}
                  />
                  {i < 4 && (
                    <span className="absolute top-1 left-1 rounded-full bg-black/60 px-1.5 text-[10px] font-medium text-white">
                      {i + 1}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label="Fjern bildet"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await deletePortfolioImage(img.id);
                        setImages(await listPortfolio(sel.id));
                      })
                    }
                    className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm text-white"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">
            Vil du endre rekkefølgen?{" "}
            <Link href={`/admin/ansatte/portefolje?ansatt=${sel.id}`} className="text-accent-soft underline-offset-2 hover:underline">
              Åpne «Bilder av arbeidet»
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
