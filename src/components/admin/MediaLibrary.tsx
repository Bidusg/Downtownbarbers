"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type { SiteImage, SiteMedia, SiteSection } from "@/lib/site-sections";
import { SECTION_META } from "@/lib/site-sections";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  registerUploadedMedia,
  updateMedia,
  deleteMedia,
  placeMedia,
  removePlacement,
  togglePlacement,
  movePlacement,
  reorderSection,
} from "@/app/admin/bilder/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmButton } from "@/components/ui/ConfirmButton";

type Result = { ok?: true; error?: string };

function Thumb({ url, kind, alt, className }: { url: string; kind: "image" | "video"; alt?: string | null; className?: string }) {
  const cls = className ?? "h-24 w-full object-cover";
  if (kind === "video") return <video src={url} muted preload="metadata" className={cls} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt ?? ""} loading="lazy" className={cls} />;
}

const SECTION_LABEL: Record<SiteSection, string> = {
  hero: "Hero",
  gallery: "Galleri",
  about: "Om oss",
  banner: "Banner",
};

/* ------------------------------------------------------------------ */
/* Opplasting                                                          */
/* ------------------------------------------------------------------ */
type UpItem = { name: string; pct: number; status: "venter" | "laster" | "ok" | "feil"; msg?: string };

function slugName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "fil"
  );
}

/**
 * Opplasting rett fra nettleseren til Supabase Storage (ikke via serveren):
 * ingen 4 MB-grense, videoer og mange filer om gangen går fint, og hver fil
 * får egen fremdrift. Etterpå registreres fila via en server action.
 */
function Uploader() {
  const router = useRouter();
  const [items, setItems] = useState<UpItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<SiteSection | "">("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadAll(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setItems(files.map((f) => ({ name: f.name, pct: 0, status: "venter" })));
    const sb = createClient();
    const MAX = 200 * 1024 * 1024;
    // 3 filer parallelt – raskt, men uten å kvele nettet på mobil.
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const idx = next++;
        const file = files[idx];
        const set = (patch: Partial<UpItem>) =>
          setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
        if (file.size > MAX) {
          set({ status: "feil", msg: "over 200 MB" });
          continue;
        }
        const kind = file.type.startsWith("video/") ? "video" : "image";
        if (kind === "image" && !file.type.startsWith("image/")) {
          set({ status: "feil", msg: "ikke bilde/video" });
          continue;
        }
        const path = `media/${crypto.randomUUID()}-${slugName(file.name)}`;
        set({ status: "laster", pct: 5 });
        // Fremdrift: Storage-SDK-en gir ikke progress på upload, så vi
        // simulerer jevn fremdrift ut fra filstørrelse til svaret kommer.
        const est = Math.max(1500, file.size / 400); // ~400 kB/s pessimistisk
        const t0 = Date.now();
        const tick = setInterval(() => {
          const p = Math.min(90, 5 + ((Date.now() - t0) / est) * 85);
          set({ pct: Math.round(p) });
        }, 200);
        const { error } = await sb.storage.from("site").upload(path, file, {
          upsert: false,
          contentType: file.type || undefined,
        });
        clearInterval(tick);
        if (error) {
          set({ status: "feil", msg: error.message.includes("row-level") ? "ingen tilgang" : "opplasting feilet" });
          continue;
        }
        const r = await registerUploadedMedia({
          path,
          kind,
          label: file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "),
          section,
        });
        if (r.error) set({ status: "feil", msg: r.error });
        else set({ status: "ok", pct: 100 });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  const done = items.filter((i) => i.status === "ok").length;
  const failed = items.filter((i) => i.status === "feil").length;

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted">
          Last opp bilder/klipp (velg gjerne mange – lastes rett til lagring)
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            disabled={busy}
            onChange={(e) => uploadAll(Array.from(e.target.files ?? []))}
            className="mt-1 block text-xs text-fg file:mr-2 file:border file:border-line-2 file:bg-canvas file:px-2 file:py-1 file:text-xs"
          />
        </label>
        <label className="text-xs text-muted">
          Legg rett i seksjon (valgfritt)
          <select
            value={section}
            onChange={(e) => setSection(e.target.value as SiteSection | "")}
            disabled={busy}
            className="mt-1 block border border-line-2 bg-canvas px-2 py-1.5 text-xs text-fg"
          >
            <option value="">Bare til galleriet</option>
            {SECTION_META.map((s) => (
              <option key={s.key} value={s.key}>
                {SECTION_LABEL[s.key]}
              </option>
            ))}
          </select>
        </label>
        {items.length > 0 && (
          <p className="text-xs text-muted">
            {busy ? `Laster opp … ${done}/${items.length}` : `${done} ferdig${failed ? `, ${failed} feilet` : ""}`}
          </p>
        )}
      </div>
      {items.length > 0 && (
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-40 truncate text-fg sm:w-64">{it.name}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <span
                  className={"block h-full transition-[width] " + (it.status === "feil" ? "bg-danger" : "bg-accent-soft")}
                  style={{ width: `${it.status === "feil" ? 100 : it.pct}%` }}
                />
              </span>
              <span className={"w-24 text-right " + (it.status === "feil" ? "text-danger" : "text-muted")}>
                {it.status === "ok" ? "✓" : it.status === "feil" ? (it.msg ?? "feil") : it.status === "laster" ? `${it.pct}%` : "venter"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Én seksjon: plasseringer i rekkefølge (dra-og-slipp + knapper)      */
/* ------------------------------------------------------------------ */
function SectionPanel({
  section,
  placements,
  media,
}: {
  section: (typeof SECTION_META)[number];
  placements: SiteImage[];
  media: SiteMedia[];
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [order, setOrder] = useState<string[] | null>(null); // optimistisk rekkefølge

  const list = useMemo(() => {
    if (!order) return placements;
    const byId = new Map(placements.map((p) => [p.id, p]));
    return order.map((id) => byId.get(id)).filter((p): p is SiteImage => !!p);
  }, [order, placements]);

  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (r.error) setErr(r.error);
    });

  const inSection = new Set(placements.map((p) => p.mediaId));
  const candidates = media.filter(
    (m) => !inSection.has(m.id) && (section.key === "hero" || m.kind === "image"),
  );

  function drop(targetId: string) {
    if (!dragging || dragging === targetId) return;
    const ids = list.map((p) => p.id);
    const from = ids.indexOf(dragging);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setOrder(ids);
    setDragging(null);
    run(async () => {
      const r = await reorderSection(section.key, ids);
      setOrder(null);
      return r;
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-bold">{section.title}</h3>
          <p className="text-xs text-muted">
            {section.hint}
            {!section.single && " · dra for å endre rekkefølge"}
          </p>
        </div>
        <Button
          type="button"
          variant="subtle"
          onClick={() => setPickerOpen((o) => !o)}
          className="px-3 py-1.5 text-xs"
        >
          {pickerOpen ? "Lukk" : "+ Velg fra galleriet"}
        </Button>
      </div>

      {pickerOpen && (
        <div className="mt-3 border border-dashed border-line-2 bg-canvas p-3">
          <p className="mb-2 text-xs text-muted">Klikk et bilde for å legge det i {SECTION_LABEL[section.key].toLowerCase()}:</p>
          {candidates.length === 0 ? (
            <p className="text-xs text-muted">Alle bildene i galleriet ligger allerede her.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
              {candidates.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => placeMedia(m.id, section.key))}
                  title={m.label ?? m.alt ?? ""}
                  className="overflow-hidden rounded border border-line transition-colors hover:border-accent-soft"
                >
                  <Thumb url={m.url} kind={m.kind} alt={m.alt} className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {err && <p className="mt-2 text-xs text-danger">{err}</p>}

      {list.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Ingen bilder her – forsiden viser standardbildene.</p>
      ) : (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {list.map((p, i) => (
            <div
              key={p.id}
              draggable={!section.single}
              onDragStart={() => setDragging(p.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(p.id)}
              onDragEnd={() => setDragging(null)}
              className={
                "w-40 shrink-0 overflow-hidden rounded border " +
                (p.active ? "border-line bg-surface" : "border-line bg-surface/40 opacity-60") +
                (dragging === p.id ? " ring-2 ring-accent-soft" : "")
              }
            >
              <div className="relative">
                <Thumb url={p.url} kind={p.kind} alt={p.alt} className="h-24 w-full object-cover" />
                <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                {!p.active && (
                  <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1.5 text-[10px] text-white">
                    skjult
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 px-1.5 py-1">
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    aria-label="Flytt frem"
                    disabled={i === 0 || pending}
                    onClick={() => run(() => movePlacement(p.id, "up"))}
                    className="act disabled:opacity-30"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label="Flytt bak"
                    disabled={i === list.length - 1 || pending}
                    onClick={() => run(() => movePlacement(p.id, "down"))}
                    className="act disabled:opacity-30"
                  >
                    →
                  </button>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => togglePlacement(p.id, !p.active))}
                  className="act act-accent"
                >
                  {p.active ? "Skjul" : "Vis"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => removePlacement(p.id))}
                  className="act act-danger"
                >
                  Fjern
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Biblioteket: alle bilder                                            */
/* ------------------------------------------------------------------ */
function MediaCard({ m, usedIn }: { m: SiteMedia; usedIn: SiteSection[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(m.label ?? "");
  const [alt, setAlt] = useState(m.alt ?? "");
  const [target, setTarget] = useState<SiteSection>("gallery");

  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (r.error) setErr(r.error);
    });

  return (
    <div className="flex flex-col overflow-hidden rounded border border-line bg-surface">
      <Thumb url={m.url} kind={m.kind} alt={m.alt} className="aspect-[4/3] w-full object-cover" />
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        {editing ? (
          <div className="space-y-1">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Navn"
              className="w-full border border-line-2 bg-canvas px-2 py-1 text-xs text-fg"
            />
            <input
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Alt-tekst (for Google/skjermleser)"
              className="w-full border border-line-2 bg-canvas px-2 py-1 text-xs text-fg"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const r = await updateMedia(m.id, { label, alt });
                    if (!r.error) setEditing(false);
                    return r;
                  })
                }
                className="act act-accent"
              >
                Lagre
              </button>
              <button type="button" onClick={() => setEditing(false)} className="act">
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="truncate text-left text-xs font-semibold text-fg hover:underline"
            title="Rediger navn/alt-tekst"
          >
            {m.label || m.alt || (m.builtin ? m.path.split("/").pop() : "Uten navn")}
          </button>
        )}
        <div className="flex flex-wrap gap-1">
          {usedIn.length === 0 ? (
            <Badge tone="neutral">Ikke i bruk</Badge>
          ) : (
            usedIn.map((s) => (
              <Badge key={s} tone="success">
                {SECTION_LABEL[s]}
              </Badge>
            ))
          )}
          {m.kind === "video" && <Badge tone="neutral">Klipp</Badge>}
        </div>
        <div className="mt-auto flex items-center gap-1 pt-1">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as SiteSection)}
            className="min-w-0 flex-1 border border-line-2 bg-canvas px-1 py-1 text-[11px] text-fg"
            aria-label="Seksjon"
          >
            {SECTION_META.filter((s) => m.kind === "image" || s.key === "hero").map((s) => (
              <option key={s.key} value={s.key} disabled={usedIn.includes(s.key)}>
                {SECTION_LABEL[s.key]}
                {usedIn.includes(s.key) ? " ✓" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || usedIn.includes(target)}
            onClick={() => run(() => placeMedia(m.id, target))}
            className="border border-line-2 px-2 py-1 text-[11px] font-semibold text-fg hover:border-accent-soft disabled:opacity-40"
          >
            Legg i
          </button>
        </div>
        <div className="flex justify-end">
          <ConfirmButton
            label={m.builtin ? "Fjern fra galleri" : "Slett"}
            question={
              m.builtin
                ? "Fjerne bildet fra galleriet? Filen ligger fortsatt i nettsidens kode, og alle plasseringer fjernes."
                : "Slette bildet permanent? Alle plasseringer fjernes."
            }
            confirmLabel="Ja"
            pendingLabel="Sletter …"
            onConfirm={() => deleteMedia(m.id)}
          />
        </div>
        {err && <p className="text-[11px] text-danger">{err}</p>}
      </div>
    </div>
  );
}

export function MediaLibrary({ media, placements }: { media: SiteMedia[]; placements: SiteImage[] }) {
  const [filter, setFilter] = useState<"all" | "unused" | SiteSection>("all");
  const usedBy = useMemo(() => {
    const m = new Map<string, SiteSection[]>();
    for (const p of placements) {
      if (!p.mediaId) continue;
      const list = m.get(p.mediaId) ?? [];
      if (!list.includes(p.section)) list.push(p.section);
      m.set(p.mediaId, list);
    }
    return m;
  }, [placements]);

  const shown = media.filter((m) => {
    const used = usedBy.get(m.id) ?? [];
    if (filter === "all") return true;
    if (filter === "unused") return used.length === 0;
    return used.includes(filter);
  });

  return (
    <div className="space-y-8">
      <Uploader />

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold">Hvor vises hva</h2>
          <p className="text-sm text-muted">
            Hver seksjon viser bildene sine i denne rekkefølgen. «Skjul» tar et bilde
            av forsiden uten å fjerne det; «Fjern» tar det ut av seksjonen, men det
            blir liggende i galleriet under.
          </p>
        </div>
        {SECTION_META.map((s) => (
          <SectionPanel
            key={s.key}
            section={s}
            placements={placements.filter((p) => p.section === s.key)}
            media={media}
          />
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">Galleri – alle bilder ({media.length})</h2>
            <p className="text-sm text-muted">
              Alt som er lastet opp pluss de innebygde bildene. Klikk navnet for å
              endre navn/alt-tekst. Bruk «Legg i» for å plassere et bilde i en seksjon.
            </p>
          </div>
          <div className="flex flex-wrap gap-1 text-xs">
            {(
              [
                ["all", "Alle"],
                ["unused", "Ikke i bruk"],
                ...SECTION_META.map((s) => [s.key, SECTION_LABEL[s.key]] as const),
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key as typeof filter)}
                className={
                  "rounded-full border px-3 py-1 " +
                  (filter === key ? "border-accent-soft bg-accent-soft/15 text-fg" : "border-line text-muted hover:text-fg")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-muted">Ingen bilder i dette utvalget.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {shown.map((m) => (
              <MediaCard key={m.id} m={m} usedIn={usedBy.get(m.id) ?? []} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
