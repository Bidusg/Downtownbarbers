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
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Input";

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
        <Badge tone={img.active ? "success" : "neutral"}>
          {img.active ? "Vises på forsiden" : "Skjult (kun forhåndsvisning)"}
        </Badge>
        {err && <p className="text-[11px] text-danger">{err}</p>}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="subtle"
          type="button"
          aria-label="Flytt opp"
          disabled={isTop || pending}
          onClick={() => run(() => moveSiteImage(img.id, "up"))}
          className="px-2 py-1 text-xs"
        >
          ↑
        </Button>
        <Button
          variant="subtle"
          type="button"
          aria-label="Flytt ned"
          disabled={isBottom || pending}
          onClick={() => run(() => moveSiteImage(img.id, "down"))}
          className="px-2 py-1 text-xs"
        >
          ↓
        </Button>
      </div>
      <Button
        variant="link"
        type="button"
        disabled={pending}
        onClick={() => run(() => toggleSiteImage(img.id, !img.active))}
        className="text-xs font-semibold"
      >
        {img.active ? "Skjul" : "Vis"}
      </Button>
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
    <Card>
      <div className="space-y-3">
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
          <Field label="Alt-tekst">
            <Input name="alt" placeholder="Kort beskrivelse" />
          </Field>
        )}
        <Button
          type="submit"
          disabled={pending}
          className="px-3 py-1.5 text-sm"
        >
          {pending ? "Laster opp …" : "Legg til"}
        </Button>
        {err && <p className="w-full text-xs text-danger">{err}</p>}
      </form>

      {list.length === 0 ? (
        <EmptyState description="Ingen egne bilder – forsiden viser standardbildene til du legger til noen." />
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
    </Card>
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
