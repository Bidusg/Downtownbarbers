"use client";

import { useState, useTransition } from "react";
import type { SiteSettings, OpeningHour } from "@/lib/site-settings";
import { updateSite } from "@/app/admin/nettside/actions";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

const input =
  "w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft";

export function SiteSettingsForm({ initial }: { initial: SiteSettings }) {
  const [s, setS] = useState<SiteSettings>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function set<K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
  }
  function setHour(i: number, key: keyof OpeningHour, v: string) {
    setS((prev) => {
      const oh = prev.opening_hours.map((h, idx) =>
        idx === i ? { ...h, [key]: v } : h,
      );
      return { ...prev, opening_hours: oh };
    });
  }
  function addHour() {
    setS((prev) => ({
      ...prev,
      opening_hours: [...prev.opening_hours, { day: "", hours: "" }],
    }));
  }
  function removeHour(i: number) {
    setS((prev) => ({
      ...prev,
      opening_hours: prev.opening_hours.filter((_, idx) => idx !== i),
    }));
  }

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateSite(s);
      setMsg(res.ok ? "Lagret ✓ – forsiden er oppdatert." : res.error ?? "Feil");
    });
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 border border-line bg-surface p-5 sm:grid-cols-2">
        <h2 className="font-display text-lg font-bold sm:col-span-2">Topptekst (hero)</h2>
        <Field label="Overskrift">
          <input className={input} value={s.hero_title} onChange={(e) => set("hero_title", e.target.value)} />
        </Field>
        <Field label="Overskrift (kursiv, farget)">
          <input className={input} value={s.hero_italic} onChange={(e) => set("hero_italic", e.target.value)} />
        </Field>
        <Field label="Ingress">
          <textarea className={input} rows={2} value={s.intro} onChange={(e) => set("intro", e.target.value)} />
        </Field>
        <Field label="Etablert (år)">
          <input className={input} value={s.established} onChange={(e) => set("established", e.target.value)} />
        </Field>
      </section>

      <section className="grid gap-4 border border-line bg-surface p-5 sm:grid-cols-2">
        <h2 className="font-display text-lg font-bold sm:col-span-2">Om oss & CTA</h2>
        <Field label="Om oss-tekst">
          <textarea className={input} rows={3} value={s.about_text} onChange={(e) => set("about_text", e.target.value)} />
        </Field>
        <div />
        <Field label="CTA-overskrift">
          <input className={input} value={s.cta_title} onChange={(e) => set("cta_title", e.target.value)} />
        </Field>
        <Field label="CTA-tekst">
          <input className={input} value={s.cta_text} onChange={(e) => set("cta_text", e.target.value)} />
        </Field>
      </section>

      <section className="grid gap-4 border border-line bg-surface p-5 sm:grid-cols-2">
        <h2 className="font-display text-lg font-bold sm:col-span-2">Kontakt</h2>
        <Field label="Adresse">
          <input className={input} value={s.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field label="Telefon">
          <input className={input} value={s.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="E-post (valgfri)">
          <input className={input} value={s.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        </Field>
      </section>

      <section className="border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Åpningstider</h2>
          <button onClick={addHour} className="text-xs text-accent-soft hover:underline">
            + Legg til rad
          </button>
        </div>
        <div className="space-y-2">
          {s.opening_hours.map((h, i) => (
            <div key={i} className="flex gap-2">
              <input className={input + " flex-1"} placeholder="Dag" value={h.day} onChange={(e) => setHour(i, "day", e.target.value)} />
              <input className={input + " flex-1"} placeholder="Tid" value={h.hours} onChange={(e) => setHour(i, "hours", e.target.value)} />
              <button onClick={() => removeHour(i)} className="px-2 text-danger hover:underline">×</button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 border border-line bg-surface p-5 sm:grid-cols-3">
        <h2 className="font-display text-lg font-bold sm:col-span-3">Utseende & vurdering</h2>
        <Field label="Aksentfarge">
          <div className="flex items-center gap-2">
            <input type="color" value={s.accent_hex} onChange={(e) => set("accent_hex", e.target.value)} className="h-10 w-14 border border-line-2 bg-canvas" />
            <input className={input} value={s.accent_hex} onChange={(e) => set("accent_hex", e.target.value)} />
          </div>
        </Field>
        <Field label="Vis vurdering på forsiden">
          <select className={input} value={s.show_rating ? "1" : "0"} onChange={(e) => set("show_rating", e.target.value === "1")}>
            <option value="1">Ja</option>
            <option value="0">Nei</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Stjerner">
            <input className={input} type="number" step="0.1" value={s.rating_value} onChange={(e) => set("rating_value", Number(e.target.value))} />
          </Field>
          <Field label="Antall">
            <input className={input} type="number" value={s.rating_count} onChange={(e) => set("rating_count", Number(e.target.value))} />
          </Field>
        </div>
      </section>

      <div className="sticky bottom-0 flex items-center gap-4 border-t border-line bg-canvas py-4">
        <button
          onClick={save}
          disabled={pending}
          className="bg-accent px-6 py-3 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-40"
        >
          {pending ? "Lagrer …" : "Lagre endringer"}
        </button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </div>
  );
}
