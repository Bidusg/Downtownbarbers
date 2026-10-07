"use client";

import { useState, useTransition } from "react";
import { saveSiteTexts } from "@/app/admin/nettside/actions";
import { EDITABLE_TEXTS, type TextOverrides } from "@/lib/site-texts-config";
import { dictionary } from "@/lib/i18n/dictionary";

/* =====================================================================
 * REDIGER TEKSTER (admin → Nettside)
 *   Endre faste tekster på nettsiden (norsk + engelsk). La et felt stå tomt
 *   for å bruke standardteksten (vist som grå plassholder). Lagres samlet.
 *
 *   Visning: én seksjon om gangen. Bla med pil venstre/høyre (eller trykk
 *   rett på en seksjon i rekken) i stedet for én lang scroll. Alle feltene
 *   bor i samme state, så du kan redigere flere seksjoner og lagre alt samlet.
 * ===================================================================== */

type Vals = Record<string, { no: string; en: string }>;

function initVals(overrides: TextOverrides): Vals {
  const v: Vals = {};
  for (const g of EDITABLE_TEXTS) {
    for (const it of g.items) {
      v[it.key] = {
        no: overrides[it.key]?.no ?? "",
        en: overrides[it.key]?.en ?? "",
      };
    }
  }
  return v;
}

const inputCls =
  "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted/70 focus:border-accent-soft focus:outline-none";

export function SiteTextsManager({ overrides }: { overrides: TextOverrides }) {
  const [vals, setVals] = useState<Vals>(() => initVals(overrides));
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const total = EDITABLE_TEXTS.length;
  const group = EDITABLE_TEXTS[active];

  function set(key: string, lang: "no" | "en", value: string) {
    setVals((v) => ({ ...v, [key]: { ...v[key], [lang]: value } }));
  }

  function go(delta: number) {
    setActive((i) => Math.min(total - 1, Math.max(0, i + delta)));
  }

  function save() {
    setMsg(null);
    setErr(false);
    const entries = Object.entries(vals).map(([key, v]) => ({
      key,
      no: v.no,
      en: v.en,
    }));
    start(async () => {
      const res = await saveSiteTexts(entries);
      if (res?.error) {
        setErr(true);
        setMsg(res.error);
      } else {
        setMsg("Tekstene er lagret ✓");
      }
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold">Tekster (rediger alt)</h2>
        <p className="text-sm text-muted">
          Endre teksten på nettsiden – norsk og engelsk. Bla mellom seksjonene
          med pilene. La et felt stå tomt for å bruke standardteksten (vist i
          grått). Alt du endrer lagres samlet når du trykker «Lagre tekster».
        </p>
      </div>

      {/* Seksjonsrekke – trykk rett på en seksjon for å hoppe dit */}
      <div className="flex flex-wrap gap-2">
        {EDITABLE_TEXTS.map((g, i) => (
          <button
            key={g.group}
            type="button"
            onClick={() => setActive(i)}
            className={
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
              (i === active
                ? "border-accent bg-accent text-accent-fg"
                : "border-line bg-surface text-muted hover:border-accent-soft hover:text-fg")
            }
          >
            {g.group}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-line bg-surface">
        {/* Topprad: pil venstre · seksjonsnavn (nr / total) · pil høyre */}
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={active === 0}
            aria-label="Forrige seksjon"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-canvas text-lg text-fg transition-opacity hover:border-accent-soft disabled:opacity-30"
          >
            ‹
          </button>
          <div className="text-center">
            <h3 className="text-sm font-semibold tracking-wide text-accent-soft uppercase">
              {group.group}
            </h3>
            <span className="text-[11px] text-muted">
              {active + 1} / {total}
            </span>
          </div>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={active === total - 1}
            aria-label="Neste seksjon"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-canvas text-lg text-fg transition-opacity hover:border-accent-soft disabled:opacity-30"
          >
            ›
          </button>
        </div>

        <div className="divide-y divide-line">
          {group.items.map((it) => {
            const def = dictionary[it.key];
            return (
              <div key={it.key} className="px-4 py-3">
                <p className="mb-1.5 text-sm font-medium text-fg">{it.label}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-muted">Norsk</span>
                    <input
                      value={vals[it.key]?.no ?? ""}
                      onChange={(e) => set(it.key, "no", e.target.value)}
                      placeholder={def?.no ?? ""}
                      className={inputCls}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-muted">Engelsk</span>
                    <input
                      value={vals[it.key]?.en ?? ""}
                      onChange={(e) => set(it.key, "en", e.target.value)}
                      placeholder={def?.en ?? def?.no ?? ""}
                      className={inputCls}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bunnrad: bla videre også her, så man slipper å scrolle opp */}
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={active === 0}
            className="rounded-md border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-fg transition-opacity hover:border-accent-soft disabled:opacity-30"
          >
            ‹ Forrige
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={active === total - 1}
            className="rounded-md border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-fg transition-opacity hover:border-accent-soft disabled:opacity-30"
          >
            Neste ›
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Lagrer …" : "Lagre tekster"}
        </button>
        {msg && (
          <span className={"text-sm " + (err ? "text-danger" : "text-muted")}>{msg}</span>
        )}
      </div>
    </section>
  );
}
