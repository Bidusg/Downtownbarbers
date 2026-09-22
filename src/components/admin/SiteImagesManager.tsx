"use client";

import { useState, useTransition } from "react";
import type { SiteImage, SiteSection } from "@/lib/site-images";
import {
  uploadSiteImage,
  deleteSiteImage,
  toggleSiteImage,
  moveSiteImage,
} from "@/app/admin/nettside/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";

const SECTIONS: { key: SiteSection; title: string; hint: string }[] = [
  { key: "hero", title: "Hero-karusell", hint: "Bilder og klipp øverst på forsiden" },
  { key: "gallery", title: "Galleri", hint: "«Fra stolen»-seksjonen" },
  { key: "about", title: "«Om oss»-bilde", hint: "Enkeltbilde – det første aktive brukes" },
  { key: "banner", title: "Banner-bilde", hint: "Neon-banneret – det første aktive brukes" },
];

function Thumb({ img }: { img: SiteImage }) {
  if (img.kind === "video") {
    return (
      <video
        src={img.url}
        muted
        className="h-16 w-24 rounded object-cover"
        preload="metadata"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={img.url}
      alt={img.alt ?? ""}
      className="h-16 w-24 rounded object-cover"
    />
  );
}

function ImageRow({
  img,
  isTop,
  isBottom,
}: {
  img: SiteImage;
  isTop: boolean;
  isBottom: boolean;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok?: true; error?: string }>) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (r.error) setErr(r.error);
    });

  return (
    <div
      className={
        "flex items-center gap-3 border border-line p-2 " +
        (img.active ? "bg-surface" : "bg-surface/40 opacity-70")
      }
    >
      <Thumb img={img} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-fg">
          {img.kind === "video" ? "🎬 Klipp" : "🖼 Bilde"}
          {img.alt ? ` · ${img.alt}` : ""}
        </p>
        <p className="text-[11px] text-muted">
          {img.active ? "Vises på forsiden" : "Skjult (kun forhåndsvisning)"}
        </p>
        {err && <p className="text-[11px] text-danger">{err}</p>}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Flytt opp"
          disabled={isTop || pending}
          onClick={() => run(() => moveSiteImage(img.id, "up"))}
          className="border border-line-2 px-2 py-1 text-xs text-muted hover:text-fg disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="Flytt ned"
          disabled={isBottom || pending}
          onClick={() => run(() => moveSiteImage(img.id, "down"))}
          className="border border-line-2 px-2 py-1 text-xs text-muted hover:text-fg disabled:opacity-30"
        >
          ↓
        </button>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => toggleSiteImage(img.id, !img.active))}
        className="text-xs font-semibold text-accent-soft hover:underline disabled:opacity-40"
      >
        {img.active ? "Skjul" : "Vis"}
      </button>
      <ConfirmButton
        label="Slett"
        question="Slette dette bildet?"
        confirmLabel="Ja, slett"
        pendingLabel="Sletter …"
        onConfirm={() => deleteSiteImage(img.id)}
      />
    </div>
  );
}

function SectionBlock({ section, images }: { section: (typeof SECTIONS)[number]; images: SiteImage[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const list = images.filter((i) => i.section === section.key);

  return (
    <div className="space-y-3 border border-line bg-surface p-5">
      <div>
        <h3 className="font-display text-lg font-bold">{section.title}</h3>
        <p className="text-xs text-muted">{section.hint}</p>
      </div>

      <form
        action={(fd) =>
          start(async () => {
            setErr(null);
            const r = await uploadSiteImage(fd);
            if (r.error) setErr(r.error);
          })
        }
        className="flex flex-wrap items-end gap-2 border-b border-line pb-3"
      >
        <input type="hidden" name="section" value={section.key} />
        <label className="text-xs text-muted">
          Fil (bilde{section.key === "hero" ? " eller klipp" : ""})
          <input
            name="file"
            type="file"
            accept={section.key === "hero" ? "image/*,video/*" : "image/*"}
            required
            className="mt-1 block text-xs text-fg file:mr-2 file:border file:border-line-2 file:bg-canvas file:px-2 file:py-1 file:text-xs"
          />
        </label>
        {section.key === "gallery" && (
          <label className="text-xs text-muted">
            Alt-tekst
            <input
              name="alt"
              placeholder="Kort beskrivelse"
              className="mt-1 block border border-line-2 bg-canvas px-2 py-1 text-sm outline-none focus:border-accent-soft"
            />
          </label>
        )}
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Laster opp …" : "Legg til"}
        </button>
        {err && <p className="w-full text-xs text-danger">{err}</p>}
      </form>

      {list.length === 0 ? (
        <p className="text-sm text-muted">
          Ingen egne bilder – forsiden viser standardbildene til du legger til noen.
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((img, i) => (
            <ImageRow
              key={img.id}
              img={img}
              isTop={i === 0}
              isBottom={i === list.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SiteImagesManager({ images }: { images: SiteImage[] }) {
  return (
    <div className="space-y-5">
      {SECTIONS.map((sec) => (
        <SectionBlock key={sec.key} section={sec} images={images} />
      ))}
    </div>
  );
}
