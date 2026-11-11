"use client";

import { useState } from "react";
import { Input, Field } from "@/components/ui/Input";
import {
  calcPrice,
  suggestPrice,
  toNum,
  LEVEL_LABEL,
  LOW_MARGIN,
  TARGET_MARGIN,
  type MarginLevel,
} from "@/lib/pricing";
import type { ProductCost } from "@/app/admin/produkter/costs";

const COST_HINT = "Kjør KJØR-I-SUPABASE-INNKJOPSPRIS.sql i Supabase først";

const kr = (n: number | null) =>
  n === null ? "—" : `${n.toLocaleString("nb-NO", { maximumFractionDigits: 2 })} kr`;
const pct = (f: number | null) =>
  f === null ? "—" : `${(f * 100).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`;

/** Tekst + farge per nivå. Tekst bærer alltid meldingen (ikke bare farge). */
function statusOf(level: MarginLevel): { text: string; cls: string } {
  switch (level) {
    case "mangler":
      return { text: "Legg inn innkjøpspris for å se margin", cls: "text-muted" };
    case "tap":
      return { text: LEVEL_LABEL.tap, cls: "text-danger" };
    case "lav":
      return {
        text: `Lav margin (under ${Math.round(LOW_MARGIN * 100)} %)`,
        cls: "text-amber-600 dark:text-amber-400",
      };
    case "høy":
      return { text: "Svært høy margin – sjekk at varen selger", cls: "text-amber-600 dark:text-amber-400" };
    default:
      return { text: LEVEL_LABEL.ok, cls: "text-accent-soft" };
  }
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={"tabular-nums text-sm " + (strong ? "font-semibold text-fg" : "text-fg")}>{value}</dd>
    </div>
  );
}

/**
 * Pris/lager/innkjøp med live kalkulator. Skjemafeltnavn er uendret:
 * price_nok, stock (kun showStock), cost_nok, supplier, supplier_sku.
 */
export function PriceCalculator({
  defaultPrice,
  defaultStock = 0,
  cost,
  costsOk,
  priceRequired = true,
  showStock = false,
}: {
  defaultPrice?: number | string;
  defaultStock?: number;
  cost?: ProductCost;
  costsOk: boolean;
  priceRequired?: boolean;
  showStock?: boolean;
}) {
  const [price, setPrice] = useState(defaultPrice === undefined ? "" : String(defaultPrice));
  const [stock, setStock] = useState(String(defaultStock));
  const [costStr, setCostStr] = useState(cost ? String(cost.cost_nok).replace(".", ",") : "");
  const [targetStr, setTargetStr] = useState(String(Math.round(TARGET_MARGIN * 100)));

  const priceInput = (
    <Input
      name="price_nok"
      type="number"
      placeholder="Pris (kr)"
      aria-label="Utsalgspris inkl. mva (kr)"
      value={price}
      onChange={(e) => setPrice(e.target.value)}
      required={priceRequired}
    />
  );
  const stockInput = showStock ? (
    <Input
      name="stock"
      type="number"
      placeholder="Lager"
      aria-label="Lager"
      value={stock}
      onChange={(e) => setStock(e.target.value)}
    />
  ) : null;

  if (!costsOk) {
    return (
      <>
        {priceInput}
        {stockInput}
        <p className="text-xs text-muted sm:col-span-2">Innkjøpspris: {COST_HINT}.</p>
      </>
    );
  }

  const c = calcPrice({ priceInkl: price, cost: costStr, stock });
  const status = statusOf(c.level);
  const tm = toNum(targetStr);
  const suggested = tm === null ? null : suggestPrice(costStr, tm / 100);

  return (
    <>
      <Field label="Utsalgspris (inkl. mva)">{priceInput}</Field>
      {showStock ? <Field label="Lager">{stockInput}</Field> : <div className="hidden sm:block" />}
      <Field label="Innkjøpspris (eks. mva)" hint="Per enhet, i kr. Kun synlig for admin og revisor.">
        <Input
          name="cost_nok"
          type="text"
          inputMode="decimal"
          placeholder="f.eks. 89,50"
          value={costStr}
          onChange={(e) => setCostStr(e.target.value)}
        />
      </Field>
      <div className="hidden sm:block" />
      <Field label="Leverandør">
        <Input name="supplier" defaultValue={cost?.supplier ?? ""} />
      </Field>
      <Field label="Leverandørens varenr.">
        <Input name="supplier_sku" defaultValue={cost?.supplier_sku ?? ""} />
      </Field>

      <div className="space-y-3 rounded-lg border border-line-2 bg-surface-2 p-3 sm:col-span-2" aria-live="polite">
        <p className={"text-sm font-medium " + status.cls}>{status.text}</p>
        {cost?.source === "anslag" && (
          <p className="text-xs text-muted">Innkjøpspris er et anslag – sjekk mot faktura</p>
        )}
        <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          <Row label="Utsalg inkl. mva" value={kr(c.priceInkl)} />
          <Row label="Utsalg eks. mva" value={kr(c.priceEks)} />
          <Row label="Innkjøp eks. mva" value={kr(c.cost)} />
          <Row label="Profitt per vare" value={kr(c.profit)} strong />
          <Row label="Margin" value={pct(c.margin)} strong />
          <Row label="Påslag" value={pct(c.markup)} />
          <Row label={`Lagerverdi (${c.stock} stk × innkjøp)`} value={kr(c.stockValueCost)} />
          <Row label="Potensiell omsetning (inkl. mva)" value={kr(c.stockValueRetail)} />
        </dl>

        <div className="flex flex-wrap items-end gap-3 border-t border-line-2 pt-3">
          <Field label="Foreslå pris – ønsket margin (%)" className="w-44">
            <Input
              type="text"
              inputMode="decimal"
              value={targetStr}
              onChange={(e) => setTargetStr(e.target.value)}
              onKeyDown={(e) => {
                // Enter her skal ikke lagre varen; bruk forslaget i stedet.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (suggested !== null) setPrice(String(suggested));
                }
              }}
            />
          </Field>
          <p className="pb-2 text-sm tabular-nums text-fg">
            {suggested === null ? "—" : `Forslag: ${kr(suggested)} inkl. mva`}
          </p>
          <button
            type="button"
            disabled={suggested === null}
            onClick={() => suggested !== null && setPrice(String(suggested))}
            className="act act-accent mb-0.5 [@media(pointer:coarse)]:min-h-11"
          >
            Bruk
          </button>
        </div>
      </div>
    </>
  );
}
