"use client";

import { useRef, useState, useTransition } from "react";
import type { AdminProduct } from "@/lib/admin-queries";
import { copyExternalProductImages, saveWebshopSettings, setProductImages, updateWebProduct, uploadProductImage } from "@/app/admin/produkter/actions";
import { TAG_OPTIONS, TAXONOMY, deptOf, type WebshopSettings } from "@/lib/shop-shared";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/* =====================================================================
 * ADMIN – nettbutikk: åpne/stenge butikken, frakt, og produktinnhold
 * (tekster, bilder, «passer godt med»).
 * ===================================================================== */

const inp = "w-full rounded-lg border border-line-2 bg-canvas px-3 py-2 text-sm text-fg";
const lbl = "block text-xs font-medium text-muted";

/** Kopier produktbilder fra Fixit (Cloudinary) til vår egen lagring. */
function CopyImagesButton({ external }: { external: number }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (external === 0 && !msg) return null;
  const run = async () => {
    setBusy(true);
    setMsg(null);
    let total = 0;
    let failed = 0;
    for (let round = 0; round < 30; round++) {
      const r = await copyExternalProductImages();
      if (r.error) {
        setMsg(`Feil: ${r.error}`);
        break;
      }
      total += r.copied;
      failed = r.failed;
      setMsg(`Kopierer … ${total} produkter ferdig, ${r.remaining} igjen`);
      if (r.remaining === 0 || r.copied === 0) {
        setMsg(`Ferdig ✓ ${total} produkter har nå bildene lagret hos oss${failed ? ` (${failed} feilet – prøv igjen)` : ""}.`);
        break;
      }
    }
    setBusy(false);
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-surface-2/60 px-4 py-3 text-sm">
      <span>
        {external} produkter bruker bilder som ligger hos Fixit eller produsenten. Lagre dem hos oss, så butikken ikke er avhengig av andre nettsider:
      </span>
      <Button onClick={run} disabled={busy} className="px-3 py-1.5 text-sm">
        {busy ? "Kopierer …" : "Lagre bildene hos oss"}
      </Button>
      {msg && <span className="text-muted">{msg}</span>}
    </div>
  );
}

export function WebshopSettingsCard({
  settings,
  stats,
}: {
  settings: WebshopSettings;
  stats: { online: number; noImage: number; review: number; external?: number };
}) {
  const [v, setV] = useState({
    live: settings.live,
    shipping_nok: settings.shippingNok,
    free_over_nok: settings.freeOverNok,
    pickup: settings.pickup,
    ship: settings.ship,
    pay_at_pickup: settings.payAtPickup,
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = (next = v) =>
    start(async () => {
      setMsg(null);
      const r = await saveWebshopSettings(next);
      setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Lagret ✓" });
    });
  const toggle = (k: "pickup" | "ship" | "pay_at_pickup") => setV((s) => ({ ...s, [k]: !s[k] }));

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-fg">Nettbutikk</h2>
          <p className="mt-1 text-sm text-muted">
            {stats.online} produkter på nett · {stats.noImage} mangler bilde · {stats.review} tekster bør sjekkes
          </p>
          <p className="mt-1 text-sm">
            <a href="/butikk" target="_blank" rel="noreferrer" className="text-accent-soft underline">
              Se butikken {v.live ? "" : "(forhåndsvisning)"} ↗
            </a>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={"rounded-full px-3 py-1 text-xs font-semibold " + (v.live ? "bg-accent-soft/15 text-accent-soft" : "bg-surface-2 text-muted")}>
            {v.live ? "Åpen for kunder" : "Stengt for kunder"}
          </span>
          <Button
            onClick={() => {
              const next = { ...v, live: !v.live };
              setV(next);
              save(next);
            }}
            disabled={pending}
            variant={v.live ? "ghost" : undefined}
            className="px-4 py-2 text-sm"
          >
            {v.live ? "Steng butikken" : "Åpne butikken"}
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label>
          <span className={lbl}>Frakt (kr)</span>
          <input type="number" min={0} className={inp} value={v.shipping_nok} onChange={(e) => setV({ ...v, shipping_nok: Number(e.target.value) })} />
        </label>
        <label>
          <span className={lbl}>Gratis frakt over (kr)</span>
          <input type="number" min={0} className={inp} value={v.free_over_nok} onChange={(e) => setV({ ...v, free_over_nok: Number(e.target.value) })} />
        </label>
        <div className="flex flex-col justify-end gap-1.5 text-sm sm:col-span-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={v.pickup} onChange={() => toggle("pickup")} /> Hent i salongen
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={v.ship} onChange={() => toggle("ship")} /> Sending med Posten
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={v.pay_at_pickup} onChange={() => toggle("pay_at_pickup")} /> «Betal ved henting»
          </label>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => save()} disabled={pending} className="px-4 py-2 text-sm">
          {pending ? "Lagrer …" : "Lagre innstillinger"}
        </Button>
        {msg && <span className={"text-sm " + (msg.ok ? "text-muted" : "text-danger")}>{msg.text}</span>}
        <span className="text-xs text-muted">
          Kortbetaling slås på med VIPPS_CARD_ENABLED=1 i Vercel når kort er aktivert i Vipps-avtalen.
        </span>
      </div>
      <CopyImagesButton external={stats.external ?? 0} />
    </Card>
  );
}

/** Gjør bildet mindre i nettleseren før opplasting (maks 1600 px, JPEG/WebP). */
async function shrink(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.2 * 1024 * 1024) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const type = file.type === "image/png" ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type, 0.86));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, type === "image/webp" ? ".webp" : ".jpg"), { type });
  } catch {
    return file;
  }
}

function ImageManager({ id, initial, name }: { id: string; initial: string[]; name: string }) {
  const [imgs, setImgs] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr(null);
    let n = 0;
    for (const f of Array.from(files).slice(0, 10)) {
      n += 1;
      setBusy(`Laster opp ${n} av ${Math.min(files.length, 10)} …`);
      const small = await shrink(f);
      const fd = new FormData();
      fd.set("image", small);
      const r = await uploadProductImage(id, fd);
      if (r.error) {
        setErr(r.error);
        break;
      }
      if (r.images) setImgs(r.images);
    }
    setBusy(null);
    if (ref.current) ref.current.value = "";
  };

  const save = async (next: string[]) => {
    const prev = imgs;
    setImgs(next);
    setBusy("Lagrer …");
    const r = await setProductImages(id, next);
    setBusy(null);
    if (r.error) {
      setErr(r.error);
      setImgs(prev);
    }
  };

  return (
    <div className="sm:col-span-2">
      <span className={lbl}>Bilder (første bilde vises i butikken)</span>
      <div className="mt-2 flex flex-wrap gap-3">
        {imgs.map((src, i) => (
          <div key={src} className="w-24">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`${name} ${i + 1}`} className={"h-24 w-24 rounded-lg object-cover " + (i === 0 ? "ring-2 ring-accent-soft" : "")} />
            <div className="mt-1 flex justify-between text-[11px]">
              {i === 0 ? (
                <span className="text-accent-soft">Hovedbilde</span>
              ) : (
                <button type="button" className="text-muted underline" onClick={() => save([src, ...imgs.filter((x) => x !== src)])}>
                  Gjør til hoved
                </button>
              )}
              <button type="button" className="text-danger underline" onClick={() => save(imgs.filter((x) => x !== src))}>
                Fjern
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex h-24 w-24 flex-col items-center justify-center rounded-lg border border-dashed border-line-2 text-xs text-muted hover:border-accent-soft hover:text-fg"
        >
          <span className="text-2xl leading-none">+</span>
          Legg til
        </button>
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      </div>
      <p className="mt-1 text-xs text-muted">Tips: lys, ensfarget bakgrunn og kvadratiske bilder ser best ut. Du kan velge flere bilder samtidig.</p>
      {busy && <p className="mt-1 text-xs text-muted">{busy}</p>}
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  );
}

/** Avdeling → produkttype (produkttypene følger valgt avdeling). */
function CategoryPicker({ category, subcategory }: { category: string | null; subcategory: string | null }) {
  const [dept, setDept] = useState(deptOf(category)?.key ?? "");
  const d = TAXONOMY.find((x) => x.key === dept);
  return (
    <>
      <label>
        <span className={lbl}>Kategori</span>
        <select name="category" value={dept} onChange={(e) => setDept(e.target.value)} className={inp}>
          <option value="">–</option>
          {TAXONOMY.map((x) => (
            <option key={x.key} value={x.key}>
              {x.no}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={lbl}>Produkttype</span>
        <select key={dept} name="subcategory" defaultValue={d?.subs.some((x) => x.key === subcategory) ? (subcategory ?? "") : ""} className={inp} disabled={!d}>
          <option value="">–</option>
          {d?.subs.map((x) => (
            <option key={x.key} value={x.key}>
              {x.no}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function WebProductEditor({ product: p, onDone }: { product: AdminProduct; onDone: () => void }) {
  const [saving, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const imgs = (p.images ?? []).length ? (p.images as string[]) : p.image_url ? [p.image_url] : [];

  return (
    <form
      action={(fd) =>
        start(async () => {
          setErr(null);
          setOk(null);
          const r = await updateWebProduct(fd);
          if (r.error) setErr(r.error);
          else setOk(`Lagret ✓ – /butikk/${r.slug}`);
        })
      }
      className="grid gap-4 rounded-xl bg-surface-2/50 p-4 sm:grid-cols-2"
    >
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="name" value={p.name} />
      {p.content_review && (
        <p className="rounded-lg bg-accent-soft/12 px-3 py-2 text-sm sm:col-span-2">
          <strong>Sjekk teksten:</strong> {p.content_note || "Vi fant ikke sikker produktinfo – kontroller mot pakken."}
        </p>
      )}

      <ImageManager id={p.id} initial={imgs} name={p.name} />

      <label>
        <span className={lbl}>Navn i nettbutikken</span>
        <input name="web_name" defaultValue={p.web_name ?? ""} placeholder={p.name} className={inp} />
      </label>
      <label>
        <span className={lbl}>Nettadresse (/butikk/…)</span>
        <input name="slug" defaultValue={p.slug ?? ""} className={inp} />
      </label>
      <label>
        <span className={lbl}>Merke</span>
        <input name="brand" defaultValue={p.brand ?? ""} className={inp} />
      </label>
<CategoryPicker category={p.category ?? null} subcategory={p.subcategory ?? null} />
      <label className="sm:col-span-2">
        <span className={lbl}>Kort beskrivelse (vises på produktkortet – én setning)</span>
        <input name="short_description" defaultValue={p.short_description ?? ""} maxLength={400} className={inp} />
      </label>
      <label className="sm:col-span-2">
        <span className={lbl}>Beskrivelse – hva produktet er (tom linje = nytt avsnitt)</span>
        <textarea name="description" defaultValue={p.description ?? ""} rows={4} className={inp} />
      </label>
      <label>
        <span className={lbl}>Hva den gjør (ett punkt per linje)</span>
        <textarea name="benefits" defaultValue={(p.benefits ?? []).join("\n")} rows={4} className={inp} />
      </label>
      <label>
        <span className={lbl}>Anbefalt for</span>
        <textarea name="recommended_for" defaultValue={p.recommended_for ?? ""} rows={4} className={inp} />
      </label>
      <label>
        <span className={lbl}>Slik bruker du den</span>
        <textarea name="how_to_use" defaultValue={p.how_to_use ?? ""} rows={3} className={inp} />
      </label>
      <label>
        <span className={lbl}>Ingredienser (valgfritt)</span>
        <textarea name="ingredients" defaultValue={p.ingredients ?? ""} rows={3} className={inp} />
      </label>
      <div className="grid grid-cols-3 gap-3 sm:col-span-2">
        <label>
          <span className={lbl}>Størrelse</span>
          <input name="size_label" defaultValue={p.size_label ?? ""} placeholder="100 ml" className={inp} />
        </label>
        <label>
          <span className={lbl}>Hold (1–5)</span>
          <select name="hold_level" defaultValue={p.hold_level ?? ""} className={inp}>
            <option value="">–</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={lbl}>Glans (1–5)</span>
          <select name="shine_level" defaultValue={p.shine_level ?? ""} className={inp}>
            <option value="">–</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <span className={lbl}>Før-pris (kr) – viser «Tilbud» når den er høyere enn prisen</span>
        <input name="compare_at_price_nok" type="number" min={0} defaultValue={p.compare_at_price_nok ?? ""} className={inp} />
      </label>
      <label>
        <span className={lbl}>Sortering (lavt tall = først)</span>
        <input name="web_sort" type="number" defaultValue={p.web_sort ?? 0} className={inp} />
      </label>
      <label className="sm:col-span-2">
        <span className={lbl}>Passer godt med (nettadresser, komma mellom) – brukes i handlekurven og «kjøpes ofte sammen»</span>
        <input name="related_slugs" defaultValue={(p.related_slugs ?? []).join(", ")} className={inp} />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className={lbl}>Behov / merking (brukes i «Finn produktet ditt»; matt, blank og sterkt hold regnes ut fra hold og glans)</legend>
        <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {TAG_OPTIONS.map((t) => (
            <label key={t.key} className="flex items-center gap-2">
              <input type="checkbox" name="tags" value={t.key} defaultChecked={(p.tags ?? []).includes(t.key)} /> {t.no}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm sm:col-span-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="online" defaultChecked={p.online !== false} /> Vis i nettbutikken
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="featured" defaultChecked={!!p.featured} /> Barbernes favoritt (vises øverst)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="content_review" defaultChecked={!!p.content_review} /> Teksten må sjekkes
        </label>
      </div>
      {err && <p className="text-sm text-danger sm:col-span-2">{err}</p>}
      {ok && <p className="text-sm text-muted sm:col-span-2">{ok}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={saving} className="px-4 py-2 text-sm">
          {saving ? "Lagrer …" : "Lagre nettbutikk-tekst"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} className="px-4 py-2 text-sm">
          Lukk
        </Button>
        {p.slug && (
          <a href={`/butikk/${p.slug}`} target="_blank" rel="noreferrer" className="self-center text-sm text-accent-soft underline">
            Se produktsiden ↗
          </a>
        )}
      </div>
    </form>
  );
}
