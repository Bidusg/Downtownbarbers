/* =====================================================================
 * SØK – felles, tilgivende matching (brukes overalt der vi søker i lister).
 *   • Store/små bokstaver, aksenter og æ/ø/å spiller ingen rolle
 *     («sören» = «soren», «bjorn» = «bjørn»).
 *   • Hvert ord i søket må treffe noe – i hvilken som helst rekkefølge
 *     («fis kid» finner «Kidus Fisseha»).
 *   • Starten av et ord holder («kid» → «Kidus»).
 *   • Små skrivefeil tåles («kidsu», «fiseha», «riccado»).
 *   • Telefon: sifrene holder, med eller uten mellomrom/+47.
 * ===================================================================== */

/** «Bjørn Ærø-Åsen» → «bjorn aero asen». */
export function normalizeSearch(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9@.]+/g, " ")
    .trim();
}

/** Damerau–Levenshtein (bytte av to naboer teller som én feil), med tak. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length;
  const n = b.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/** Hvor mange skrivefeil et søkeord tåler. */
const allowedTypos = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

/** Poeng for ett søkeord mot ordene i teksten (0 = ingen treff). */
function termScore(term: string, words: string[], joined: string): number {
  let best = 0;
  for (const w of words) {
    if (w === term) return 4;
    if (w.startsWith(term)) best = Math.max(best, 3);
  }
  if (best) return best;
  if (term.length >= 2 && joined.includes(term)) return 2;
  const typos = allowedTypos(term.length);
  if (!typos) return 0;
  for (const w of words) {
    if (w.length < 3) continue;
    // Hele ordet («fiseha» ~ «fisseha») eller starten («kidsu» ~ «kidus…»).
    if (editDistance(term, w, typos) <= typos) return 1;
    if (w.length > term.length && editDistance(term, w.slice(0, term.length), typos) <= typos) return 1;
  }
  return 0;
}

export type Searchable = {
  /** Fritekst (navn, e-post, merke …). */
  text: (string | null | undefined)[];
  /** Telefonnumre o.l. – matches på sifre. */
  digits?: (string | null | undefined)[];
};

/** Normalisert søk, klar til å brukes mot mange elementer. */
export function prepareSearch(query: string) {
  const norm = normalizeSearch(query);
  const terms = norm.split(" ").filter(Boolean);
  const digitsQ = query.replace(/\D/g, "").replace(/^(0047|47)(?=\d{8}$)/, "");
  return { terms, digitsQ, empty: terms.length === 0 && digitsQ.length === 0 };
}

/** Poeng for et element (0 = ikke treff, høyere = bedre). */
export function searchScore(q: ReturnType<typeof prepareSearch>, item: Searchable): number {
  if (q.empty) return 1;
  // Telefon: minst 3 sifre som henger sammen.
  if (q.digitsQ.length >= 3 && item.digits?.length) {
    for (const d of item.digits) {
      const ds = (d ?? "").replace(/\D/g, "");
      if (ds && ds.includes(q.digitsQ)) return 10;
    }
  }
  const joined = normalizeSearch(item.text.filter(Boolean).join(" "));
  if (!joined) return 0;
  const words = joined.split(" ");
  let total = 0;
  for (const t of q.terms) {
    const s = termScore(t, words, joined);
    if (!s) return 0;
    total += s;
  }
  return total;
}

/** Filtrer og sorter en liste: beste treff først, ellers original rekkefølge. */
export function searchList<T>(items: T[], query: string, fields: (item: T) => Searchable): T[] {
  const q = prepareSearch(query);
  if (q.empty) return items;
  return items
    .map((it, i) => ({ it, i, s: searchScore(q, fields(it)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.it);
}

/** Ja/nei-varianten (for eksisterende .filter()-kjeder). */
export function matchesSearch(query: string, item: Searchable): boolean {
  const q = prepareSearch(query);
  return q.empty || searchScore(q, item) > 0;
}
