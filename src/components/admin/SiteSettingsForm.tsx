"use client";

import { useState, useTransition } from "react";
import type { SiteSettings, DayHours } from "@/lib/site-settings";
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

const DAY_NAMES = [
  "Søndag",
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "21:00";

export function SiteSettingsForm({ initial }: { initial: SiteSettings }) {
  const [s, setS] = useState<SiteSettings>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Rask utfylling: felles fra/til som kan settes på flere dager samtidig.
  const [bulk, setBulk] = useState({ open: DEFAULT_OPEN, close: DEFAULT_CLOSE });

  function set<K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
  }
  function updateDay(dow: number, next: DayHours) {
    setS((prev) => ({ ...prev, hours: { ...prev.hours, [String(dow)]: next } }));
  }
  /** Sett samme tider på flere dager samtidig (rask utfylling). */
  function applyToDays(dows: number[], next: DayHours) {
    setS((prev) => {
      const hours = { ...prev.hours };
      for (const d of dows) hours[String(d)] = next;
      return { ...prev, hours };
    });
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
        <div className="mb-4">
          <h2 className="font-display text-lg font-bold">Åpningstider</h2>
          <p className="mt-1 text-xs text-muted">
            Styrer både forsiden og hva kunder kan booke. Dager merket «Stengt»
            har ingen ledige timer. Barbernes turnus klippes automatisk til
            disse tidene.
          </p>
        </div>

        {/* Rask utfylling: sett samme tider på mange dager i ett grep. */}
        <div className="mb-5 flex flex-wrap items-end gap-3 border border-line-2 bg-canvas/60 p-3">
          <label className="flex flex-col gap-1 text-xs font-semibold tracking-wide text-muted uppercase">
            Fra
            <input
              type="time"
              value={bulk.open}
              onChange={(e) => setBulk((b) => ({ ...b, open: e.target.value }))}
              className={input + " w-32"}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold tracking-wide text-muted uppercase">
            Til
            <input
              type="time"
              value={bulk.close}
              onChange={(e) => setBulk((b) => ({ ...b, close: e.target.value }))}
              className={input + " w-32"}
            />
          </label>
          <button
            type="button"
            onClick={() => applyToDays([1, 2, 3, 4, 5], { open: bulk.open, close: bulk.close })}
            className="border border-line-2 px-3 py-2.5 text-sm font-semibold text-fg transition-colors hover:border-accent-soft"
          >
            Bruk på man–fre
          </button>
          <button
            type="button"
            onClick={() => applyToDays([0, 1, 2, 3, 4, 5, 6], { open: bulk.open, close: bulk.close })}
            className="border border-line-2 px-3 py-2.5 text-sm font-semibold text-fg transition-colors hover:border-accent-soft"
          >
            Bruk på alle dager
          </button>
        </div>

        <div className="space-y-2">
          {DAY_ORDER.map((dow) => {
            const h = s.hours?.[String(dow)] ?? null;
            const closed = !h;
            return (
              <div key={dow} className="flex flex-wrap items-center gap-2">
                <span className="w-24 text-sm text-fg">{DAY_NAMES[dow]}</span>
                {/* Tydelig av/på-bryter i stedet for en «Stengt»-avkrysning. */}
                <div className="flex overflow-hidden border border-line-2 text-sm">
                  <button
                    type="button"
                    onClick={() =>
                      updateDay(dow, { open: bulk.open, close: bulk.close })
                    }
                    className={
                      "px-3 py-1.5 font-semibold transition-colors " +
                      (!closed
                        ? "bg-accent text-accent-fg"
                        : "bg-canvas text-muted hover:text-fg")
                    }
                  >
                    Åpen
                  </button>
                  <button
                    type="button"
                    onClick={() => updateDay(dow, null)}
                    className={
                      "px-3 py-1.5 font-semibold transition-colors " +
                      (closed
                        ? "bg-fg text-canvas"
                        : "bg-canvas text-muted hover:text-fg")
                    }
                  >
                    Stengt
                  </button>
                </div>
                {closed ? (
                  <span className="text-sm text-muted">Ingen ledige timer</span>
                ) : (
                  <>
                    <input
                      type="time"
                      value={h.open}
                      onChange={(e) =>
                        updateDay(dow, { open: e.target.value, close: h.close })
                      }
                      className={input + " w-32"}
                    />
                    <span className="text-muted">–</span>
                    <input
                      type="time"
                      value={h.close}
                      onChange={(e) =>
                        updateDay(dow, { open: h.open, close: e.target.value })
                      }
                      className={input + " w-32"}
                    />
                  </>
                )}
              </div>
            );
          })}
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
