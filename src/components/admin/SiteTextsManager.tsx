"use client";

import { useState, useTransition } from "react";
import { saveSiteTexts } from "@/app/admin/nettside/actions";
import { EDITABLE_TEXTS, type TextOverrides } from "@/lib/site-texts-config";
import { dictionary } from "@/lib/i18n/dictionary";

/* =====================================================================
 * REDIGER TEKSTER (admin → Nettside)
 *   Endre faste tekster på nettsiden (norsk + engelsk). La et felt stå tomt
 *   for å bruke standardteksten (vist som grå plassholder). Lagres samlet.
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
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  function set(key: string, lang: "no" | "en", value: string) {
    setVals((v) => ({ ...v, [key]: { ...v[key], [lang]: value } }));
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
          Endre teksten på nettsiden – norsk og engelsk. La et felt stå tomt for
          å bruke standardteksten (vist i grått). Endringer vises når du lagrer.
        </p>
      </div>

      <div className="space-y-6">
        {EDITABLE_TEXTS.map((g) => (
          <div key={g.group} className="rounded-lg border border-line bg-surface">
            <h3 className="border-b border-line px-4 py-2 text-sm font-semibold tracking-wide text-accent-soft uppercase">
              {g.group}
            </h3>
            <div className="divide-y divide-line">
              {g.items.map((it) => {
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
          </div>
        ))}
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
