"use client";

import { useEffect } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/* =====================================================================
 * SIDEOVERSETTER (NO → EN) for admin, kasse, revisor, ansatt, Min profil
 * og innlogging. Når språket er EN, byttes norske tekster på siden ut med
 * engelsk fra en fast ordliste (backoffice-en.json) – ingen tekst sendes
 * til noen ekstern tjeneste, så kundedata forlater aldri siden.
 *   • Oversetter tekst, placeholder, title og aria-label.
 *   • Følger med når siden endrer seg (MutationObserver).
 *   • Bytter tilbake til originalteksten når man velger NO igjen.
 *   • Ukedager og måneder i datoer oversettes ord for ord.
 *   • Hopper over felt man skriver i og alt merket translate="no".
 * ===================================================================== */

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
// Ordlista lastes først når noen velger EN (holder nettsiden lett for kunder).
const EXACT = new Map<string, string>();
const LOWER = new Map<string, string>();
let dictLoaded: Promise<void> | null = null;
function loadDict(): Promise<void> {
  dictLoaded ??= import("@/lib/i18n/backoffice-en.json").then((m) => {
    const dict = (m.default ?? m) as Record<string, string>;
    for (const [k, v] of Object.entries(dict)) {
      EXACT.set(norm(k), v);
      if (!LOWER.has(norm(k).toLowerCase())) LOWER.set(norm(k).toLowerCase(), v);
    }
  });
  return dictLoaded;
}

const WORDS: Record<string, string> = {
  mandag: "Monday", tirsdag: "Tuesday", onsdag: "Wednesday", torsdag: "Thursday",
  fredag: "Friday", lørdag: "Saturday", søndag: "Sunday",
  man: "Mon", tir: "Tue", ons: "Wed", tor: "Thu", fre: "Fri", lør: "Sat", søn: "Sun",
  januar: "January", februar: "February", mars: "March", april: "April", mai: "May",
  juni: "June", juli: "July", august: "August", september: "September",
  oktober: "October", november: "November", desember: "December",
  jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", jun: "Jun", jul: "Jul", aug: "Aug",
  sep: "Sep", okt: "Oct", nov: "Nov", des: "Dec",
  kl: "at", uke: "week", "i dag": "today", "i morgen": "tomorrow", "i går": "yesterday",
};
const WORD_RE = new RegExp(
  `(?<![\\p{L}])(${Object.keys(WORDS).sort((a, b) => b.length - a.length).join("|")})(\\.?)(?![\\p{L}])`,
  "giu",
);
// Bare bruk ord-for-ord når teksten ser ut som en dato/tid (inneholder tall).
const looksLikeDate = (s: string) => /\d/.test(s) && WORD_RE.test(s);

function translate(text: string): string | null {
  const core = norm(text);
  if (!core || core.length > 600) return null;
  let en = EXACT.get(core) ?? LOWER.get(core.toLowerCase()) ?? null;
  if (!en) {
    // «Lagre:» / «Totalt:» – prøv uten avsluttende kolon.
    const m = core.match(/^(.*?)([:：])$/);
    if (m) {
      const base = EXACT.get(m[1]) ?? LOWER.get(m[1].toLowerCase());
      if (base) en = base + m[2];
    }
  }
  if (!en) {
    WORD_RE.lastIndex = 0;
    if (looksLikeDate(core)) {
      WORD_RE.lastIndex = 0;
      en = core.replace(WORD_RE, (_, w: string, dot: string) => {
        const t = WORDS[w.toLowerCase()];
        const out = w[0] === w[0].toUpperCase() ? t.charAt(0).toUpperCase() + t.slice(1) : t;
        return w.toLowerCase() === "kl" ? out : out + (dot && t.length <= 3 ? "" : "");
      });
      // «26. Oktober» → «26 October»
      en = en.replace(/(\d{1,2})\.\s+(?=(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b)/g, "$1 ");
      if (en === core) en = null;
    }
  }
  if (!en) return null;
  const lead = text.match(/^\s*/)?.[0] ?? "";
  const trail = text.match(/\s*$/)?.[0] ?? "";
  return lead + en + trail;
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "SVG", "svg"]);
const ATTRS = ["placeholder", "title", "aria-label"] as const;

type TextRec = { orig: string; en: string };
const textRecs = new WeakMap<Text, TextRec>();
const touched = new Set<Text>();
const attrRecs = new WeakMap<Element, Record<string, TextRec>>();
const touchedEls = new Set<Element>();

function skip(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP_TAGS.has(e.tagName)) return true;
    if (e.getAttribute?.("translate") === "no" || e.classList?.contains("notranslate")) return true;
    if ((e as HTMLElement).isContentEditable) return true;
  }
  return false;
}

function doText(node: Text) {
  const cur = node.nodeValue ?? "";
  const rec = textRecs.get(node);
  if (rec && cur === rec.en) return; // allerede oversatt
  const en = translate(cur);
  if (en && en !== cur) {
    textRecs.set(node, { orig: cur, en });
    touched.add(node);
    node.nodeValue = en;
  } else if (rec) {
    textRecs.delete(node);
  }
}

function doAttrs(el: Element) {
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (!cur) continue;
    const recs = attrRecs.get(el) ?? {};
    if (recs[a] && recs[a].en === cur) continue;
    const en = translate(cur);
    if (en && en !== cur) {
      recs[a] = { orig: cur, en };
      attrRecs.set(el, recs);
      touchedEls.add(el);
      el.setAttribute(a, en);
    }
  }
  if (el instanceof HTMLInputElement && (el.type === "submit" || el.type === "button") && el.value) {
    const en = translate(el.value);
    if (en && en !== el.value) el.value = en;
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (!skip((root as Text).parentElement)) doText(root as Text);
    return;
  }
  if (!(root instanceof Element)) return;
  if ((root.tagName === "INPUT" || root.tagName === "TEXTAREA") && !skip(root.parentElement)) {
    doAttrs(root);
    return;
  }
  if (skip(root)) return;
  doAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(n) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as Element;
        if (el.getAttribute("translate") === "no" || el.classList.contains("notranslate"))
          return NodeFilter.FILTER_REJECT;
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          doAttrs(el); // placeholder o.l., men aldri innholdet
          return NodeFilter.FILTER_REJECT;
        }
        if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
    else doAttrs(n as Element);
  }
}

function restoreAll() {
  for (const node of touched) {
    const rec = textRecs.get(node);
    if (rec && node.nodeValue === rec.en) node.nodeValue = rec.orig;
    textRecs.delete(node);
  }
  touched.clear();
  for (const el of touchedEls) {
    const recs = attrRecs.get(el);
    if (recs) for (const [a, r] of Object.entries(recs)) if (el.getAttribute(a) === r.en) el.setAttribute(a, r.orig);
    attrRecs.delete(el);
  }
  touchedEls.clear();
}

export function PageTranslator() {
  const { lang } = useLanguage();

  useEffect(() => {
    if (lang !== "en") {
      restoreAll();
      return;
    }
    const root = document.body;
    let cancelled = false;

    let queued = new Set<Node>();
    let raf = 0;
    const flush = () => {
      raf = 0;
      const items = queued;
      queued = new Set();
      for (const n of items) if (n.isConnected) walk(n);
      // Rydd bort noder som ikke lenger finnes.
      for (const t of touched) if (!t.isConnected) touched.delete(t);
      for (const e of touchedEls) if (!e.isConnected) touchedEls.delete(e);
    };
    const mo = new MutationObserver((muts) => {
      if (!EXACT.size) return;
      for (const m of muts) {
        if (m.type === "characterData") queued.add(m.target);
        else if (m.type === "attributes") queued.add(m.target);
        else m.addedNodes.forEach((n) => queued.add(n));
      }
      if (!raf) raf = requestAnimationFrame(flush);
    });
    loadDict().then(() => {
      if (cancelled) return;
      walk(root);
      mo.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [...ATTRS],
      });
    });
    return () => {
      cancelled = true;
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [lang]);

  return null;
}

/** NO | EN-bryter for back-office (samme valg som på nettsiden). */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLanguage();
  return (
    <div
      role="group"
      aria-label={lang === "en" ? "Language" : "Språk"}
      translate="no"
      className={"notranslate flex items-center rounded-lg border border-line-2 p-0.5 text-xs font-semibold " + className}
    >
      {(["no", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={
            "min-h-8 rounded-md px-2.5 transition-colors [@media(pointer:coarse)]:min-h-10 " +
            (lang === l ? "bg-fg text-canvas" : "text-muted hover:text-fg")
          }
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
