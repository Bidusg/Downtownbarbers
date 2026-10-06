/* =====================================================================
 * Leser «Omsetning en ansatt»-rapporten (PDF fra gammelt kassesystem,
 * Microsoft Reporting Services) etter at teksten er hentet ut.
 *
 * Rapporten har én ansatt og tabellen «Resultat pr. måned», f.eks.:
 *   jan 2026 233,00 186 108 892 4 886 113 779 0 0 0,00
 *   (måned år timer besøk behandling varesalg sum oppgj1 oppgj2 vareforbruk)
 *
 * Tusenskilletegn er mellomrom, så «108 892 4 886 113 779» er tvetydig.
 * Vi prøver alle oppdelinger og velger den der behandling + varesalg = sum
 * (±2 kr pga. avrunding).
 * Ren funksjon (ingen I/O) – testbar.
 * ===================================================================== */

export type ParsedMonth = {
  month: string; // YYYY-MM
  hours: number;
  visits: number;
  treatmentNok: number;
  productNok: number;
  totalNok: number;
};

export type ParsedReport = {
  employee: string | null; // navnet slik det står i rapporten
  inclVat: boolean; // «Inklusiv mva»
  months: ParsedMonth[];
  warnings: string[];
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, mai: 5, may: 5, jun: 6, jul: 7,
  aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};

const dec = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));

/** Alle måter å dele `tokens` i `n` heltall med mellomrom som tusenskille. */
function splits(tokens: string[], n: number): number[][] {
  const out: number[][] = [];
  const rec = (i: number, acc: number[]) => {
    if (acc.length === n) {
      if (i === tokens.length) out.push(acc);
      return;
    }
    // Første gruppe i et tall: 1–3 sifre; påfølgende grupper: nøyaktig 3.
    if (!/^-?\d{1,3}$/.test(tokens[i] ?? "")) return;
    let str = tokens[i];
    rec(i + 1, [...acc, Number(str)]);
    for (let j = i + 1; j < tokens.length && /^\d{3}$/.test(tokens[j]); j++) {
      str += tokens[j];
      rec(j + 1, [...acc, Number(str)]);
    }
  };
  rec(0, []);
  return out;
}

export function parseRevenueReport(text: string): ParsedReport {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());

  let employee: string | null = null;
  for (const l of lines) {
    const m = /^Ansatt\s+(.+)$/i.exec(l);
    if (m) {
      employee = m[1].trim();
      break;
    }
  }
  if (!employee) {
    const m = /Resultat for (.+?),\s*\d{2}\.\d{2}\.\d{4}/i.exec(text);
    if (m) employee = m[1].trim();
  }

  const vatLine = lines.find((l) => /^Mva type/i.test(l)) ?? "";
  const inclVat = !/eksklusiv/i.test(vatLine);
  if (/eksklusiv/i.test(vatLine))
    warnings.push("Rapporten er eksklusiv mva – beløpene er regnet om til inkl. mva (×1,25).");

  const months: ParsedMonth[] = [];
  for (const l of lines) {
    const m = /^([a-zæøå]{3})\w*\.?\s+(\d{4})\s+(.+)$/i.exec(l);
    if (!m) continue;
    const mon = MONTHS[m[1].toLowerCase()];
    if (!mon) continue;
    const toks = m[3].split(" ");
    // timer (desimal), besøk (heltall), … , vareforbruk (desimal, sist)
    const hoursTok = toks[0];
    if (!/^\d+,\d+$/.test(hoursTok)) continue;
    const lastTok = toks[toks.length - 1];
    const rest = /,\d+$/.test(lastTok) ? toks.slice(1, -1) : toks.slice(1);
    // besøk + behandling + varesalg + sum + oppgj1 + oppgj2 = 6 tall
    // Beløpene er avrundet hver for seg, så summen kan avvike med ±1–2 kr.
    const cands = splits(rest, 6).filter(([, b, v, s]) => Math.abs(b + v - s) <= 2);
    if (cands.length === 0) {
      warnings.push(`Klarte ikke å lese linjen «${l}».`);
      continue;
    }
    // Flere treff: velg det med minst besøk (besøk er sjelden > 999).
    const [visits, b, v, s] = cands.sort(
      (a, c) => Math.abs(a[1] + a[2] - a[3]) - Math.abs(c[1] + c[2] - c[3]) || a[0] - c[0],
    )[0];
    const k = inclVat ? 1 : 1.25;
    months.push({
      month: `${m[2]}-${String(mon).padStart(2, "0")}`,
      hours: dec(hoursTok),
      visits,
      treatmentNok: Math.round(b * k),
      productNok: Math.round(v * k),
      totalNok: Math.round(s * k),
    });
  }
  if (!employee) warnings.push("Fant ikke navnet på den ansatte i rapporten.");
  if (months.length === 0) warnings.push("Fant ingen månedstall i rapporten.");
  return { employee, inclVat, months, warnings };
}
