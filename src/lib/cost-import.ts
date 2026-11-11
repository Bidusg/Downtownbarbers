/* =====================================================================
 * INNKJØPSPRIS-IMPORT – ren logikk (ingen Supabase/React).
 *   parseCostSheet: finner overskriftsrad og kolonner i en regnearkfil
 *   (rader som tabell av celleverdier) og lager ImportRow-er.
 *   matchCostRows: kobler radene mot produktene (strekkode først, så navn).
 *   Innkjøpspris i fila er EKS. mva (som product_costs.cost_nok).
 * ===================================================================== */

export type ImportRow = {
  /** Linjenummer i fila (1-basert, som i Excel). */
  line: number;
  barcode: string | null;
  name: string;
  brand: string | null;
  cost: number | null;
  priceInkl: number | null;
  note: string | null;
  isEstimate: boolean;
};

export type ImportProduct = {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  price_nok: number;
  stock: number;
};

export type MatchedItem = {
  line: number;
  productId: string;
  productName: string;
  barcode: string | null;
  matchedBy: "strekkode" | "navn";
  /** Eksisterende innkjøpspris i databasen (null = ingen). */
  oldCost: number | null;
  newCost: number;
  /** Utsalgspris inkl. mva i fila (null = ikke i fila). */
  filePrice: number | null;
  /** Utsalgspris inkl. mva i databasen. */
  dbPrice: number;
  /** filePrice − dbPrice når |diff| > 0,5, ellers null. */
  priceDiff: number | null;
  isEstimate: boolean;
  note: string | null;
};

export type UnmatchedItem = {
  line: number;
  name: string;
  brand: string | null;
  barcode: string | null;
  cost: number | null;
  note: string | null;
  reason: string;
};

export type AmbiguousItem = UnmatchedItem & {
  candidates: { id: string; name: string }[];
};

export type MatchResult = {
  matched: MatchedItem[];
  priceDiffs: MatchedItem[];
  unmatched: UnmatchedItem[];
  ambiguous: AmbiguousItem[];
};

/* ---------- tall og tekst ---------- */

/** «1 234,50», «1.234,50», «89.5», «220 kr» → tall. Alt annet → null. */
export function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[\s ]/g, "").replace(/kr\.?$/i, "").replace(/^kr\.?/i, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    // Siste skilletegn er desimal.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  } else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) {
    // «1.234» / «1.234.567» = tusenskille (norsk), ikke desimal.
    s = s.replace(/\./g, "");
  }
  if (!/^[-+]?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return String(v).trim();
}

function barcodeDigits(v: unknown): string | null {
  let raw = "";
  if (typeof v === "number") raw = Number.isFinite(v) ? String(Math.round(v)) : "";
  else raw = cellText(v);
  const d = raw.replace(/\D/g, "");
  return d ? d : null;
}

/** Navn for sammenligning: små bokstaver, ett mellomrom, like bindestreker. */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ \s]+/g, " ")
    .replace(/\s*[-‐‑‒–—−]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

const stripZeros = (d: string) => d.replace(/^0+/, "");

/* ---------- parsing ---------- */

type ColMap = {
  cost: number;
  name: number;
  barcode: number;
  brand: number;
  priceInkl: number;
  note: number;
};

function findCol(header: string[], patterns: RegExp[], skip: Set<number> = new Set()): number {
  for (const re of patterns) {
    const i = header.findIndex((h, idx) => !skip.has(idx) && re.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseCostSheet(rows: unknown[][]): { rows: ImportRow[]; costHeader: string; warnings: string[] } {
  const warnings: string[] = [];
  const empty = { rows: [] as ImportRow[], costHeader: "", warnings };

  let headerIdx = -1;
  let cols: ColMap | null = null;
  let firstCandidate = -1;
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i++) {
    const header = (rows[i] ?? []).map(cellText);
    if (!header.some((h) => /strekkode/i.test(h) || /varenavn/i.test(h))) continue;
    if (firstCandidate < 0) firstCandidate = i;
    const cost = findCol(header, [/brukt innkj/i, /innkjøpspris/i, /kostpris/i, /innpris/i]);
    if (cost < 0) continue;
    const used = new Set<number>([cost]);
    const name = findCol(header, [/varenavn/i, /navn/i], used);
    const barcode = findCol(header, [/strekkode|barcode|\bean\b/i]);
    const brand = findCol(header, [/merke/i]);
    const priceInkl = findCol(header, [/utsalg inkl/i]);
    const note = findCol(header, [/kilde|merknad/i]);
    headerIdx = i;
    cols = { cost, name, barcode, brand, priceInkl, note };
    break;
  }

  if (!cols || headerIdx < 0) {
    warnings.push(
      firstCandidate >= 0
        ? "Fant overskriftsrad, men ingen kolonne for innkjøpspris (Brukt innkjøp / Innkjøpspris / Kostpris / Innpris)."
        : "Fant ingen overskriftsrad med «Strekkode» eller «Varenavn».",
    );
    return empty;
  }

  const costHeader = cellText(rows[headerIdx][cols.cost]);
  if (cols.name < 0 && cols.barcode < 0) {
    warnings.push("Fant verken navn- eller strekkodekolonne.");
    return { rows: [], costHeader, warnings };
  }
  if (cols.barcode < 0) warnings.push("Ingen strekkodekolonne – kobler bare på navn.");
  if (cols.name < 0) warnings.push("Ingen navnekolonne – kobler bare på strekkode.");

  const out: ImportRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = cols.name >= 0 ? cellText(r[cols.name]) : "";
    const barcode = cols.barcode >= 0 ? barcodeDigits(r[cols.barcode]) : null;
    if (!name && !barcode) continue;
    const note = cols.note >= 0 ? cellText(r[cols.note]) || null : null;
    out.push({
      line: i + 1,
      barcode,
      name,
      brand: cols.brand >= 0 ? cellText(r[cols.brand]) || null : null,
      cost: parseNumber(r[cols.cost]),
      priceInkl: cols.priceInkl >= 0 ? parseNumber(r[cols.priceInkl]) : null,
      note,
      isEstimate: !!note && /anslag/i.test(note),
    });
  }
  return { rows: out, costHeader, warnings };
}

/* ---------- matching ---------- */

export function matchCostRows(
  rows: ImportRow[],
  products: ImportProduct[],
  existing: Record<string, { cost_nok: number }>,
): MatchResult {
  const byExact = new Map<string, ImportProduct[]>();
  const byStripped = new Map<string, ImportProduct[]>();
  const byName = new Map<string, ImportProduct[]>();
  const push = (m: Map<string, ImportProduct[]>, k: string, p: ImportProduct) => {
    const a = m.get(k);
    if (a) a.push(p);
    else m.set(k, [p]);
  };
  for (const p of products) {
    const d = (p.barcode ?? "").replace(/\D/g, "");
    if (d) {
      push(byExact, d, p);
      const s = stripZeros(d);
      if (s) push(byStripped, s, p);
    }
    const n = normName(p.name ?? "");
    if (n) push(byName, n, p);
  }

  const res: MatchResult = { matched: [], priceDiffs: [], unmatched: [], ambiguous: [] };
  const used = new Map<string, number>(); // productId -> linje som tok den

  const base = (r: ImportRow) => ({
    line: r.line,
    name: r.name,
    brand: r.brand,
    barcode: r.barcode,
    cost: r.cost,
    note: r.note,
  });

  for (const r of rows) {
    if (r.cost === null || !Number.isFinite(r.cost) || r.cost < 0) {
      res.unmatched.push({ ...base(r), reason: "ugyldig innkjøpspris" });
      continue;
    }

    let hit: ImportProduct | null = null;
    let by: "strekkode" | "navn" = "strekkode";
    let candidates: ImportProduct[] = [];
    let ambiguousReason = "";

    if (r.barcode) {
      const exact = byExact.get(r.barcode) ?? [];
      const stripped = stripZeros(r.barcode);
      const loose = stripped ? (byStripped.get(stripped) ?? []) : [];
      if (exact.length === 1) hit = exact[0];
      else {
        const pool = exact.length > 1 ? exact : loose;
        if (pool.length === 1) hit = pool[0];
        else if (pool.length > 1) {
          candidates = pool;
          ambiguousReason = "strekkoden finnes på flere varer";
        }
      }
    }

    if (!hit && candidates.length === 0 && r.name) {
      by = "navn";
      const n = normName(r.name);
      let pool = byName.get(n) ?? [];
      if (pool.length > 1 && r.brand) {
        const b = normName(r.brand);
        const narrowed = pool.filter((p) => normName(p.brand ?? "") === b);
        if (narrowed.length > 0) pool = narrowed;
      }
      if (pool.length === 1) hit = pool[0];
      else if (pool.length > 1) {
        candidates = pool;
        ambiguousReason = "navnet finnes på flere varer";
      }
    }

    if (candidates.length > 0) {
      res.ambiguous.push({
        ...base(r),
        reason: ambiguousReason,
        candidates: candidates.slice(0, 5).map((p) => ({ id: p.id, name: p.name })),
      });
      continue;
    }
    if (!hit) {
      res.unmatched.push({ ...base(r), reason: "fant ingen vare" });
      continue;
    }

    const taken = used.get(hit.id);
    if (taken !== undefined) {
      res.ambiguous.push({
        ...base(r),
        reason: `samme vare som linje ${taken} i fila`,
        candidates: [{ id: hit.id, name: hit.name }],
      });
      continue;
    }
    used.set(hit.id, r.line);

    const dbPrice = Number(hit.price_nok) || 0;
    const diff = r.priceInkl !== null ? r.priceInkl - dbPrice : null;
    const item: MatchedItem = {
      line: r.line,
      productId: hit.id,
      productName: hit.name,
      barcode: hit.barcode,
      matchedBy: by,
      oldCost: existing[hit.id] ? Number(existing[hit.id].cost_nok) : null,
      newCost: r.cost,
      filePrice: r.priceInkl,
      dbPrice,
      priceDiff: diff !== null && Math.abs(diff) > 0.5 ? Math.round(diff * 100) / 100 : null,
      isEstimate: r.isEstimate,
      note: r.note,
    };
    res.matched.push(item);
    if (item.priceDiff !== null) res.priceDiffs.push(item);
  }
  return res;
}
