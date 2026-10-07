// Oversettelseskart for DB-styrt innhold (Etappe 4b).
//
// Her oversetter vi de konkrete norske VERDIENE som kommer fra databasen
// (tjenestenavn/-kategorier/-beskrivelser, hero-/om-oss-/slagord-/cta-tekst
// fra site_settings, samt håndverk-blokker og åpningstid-etiketter).
//
// <TDyn> slår opp den norske verdien her og viser engelsk når språket er "en".
// Finnes ingen oversettelse, vises den originale norske teksten (trygt).
//
// Kildene for de norske strengene:
//   • Tjenester/kategorier/beskrivelser → KJØR-I-SUPABASE-TJENESTER.sql
//   • Hero/slagord/om-oss/cta           → src/lib/site-settings.ts (fallback)

export type Lang = "no" | "en";

/** Ett kart = { norsk verdi: { en: engelsk } }. */
export type ContentMap = Record<string, { en: string }>;

// ---------------------------------------------------------------- TJENESTER
// Kategorinavn, tjenestenavn og -beskrivelser + tilleggene (kategori «Tillegg»).
const services: ContentMap = {
  // Kategorier
  Klipp: { en: "Haircuts" },
  Hårklipp: { en: "Haircuts" },
  Kombo: { en: "Combo" },
  Skjegg: { en: "Beard" },
  Barbering: { en: "Shaving" },
  Tillegg: { en: "Add-ons" },

  // Klipp
  "Maskinklipp/Lineup": { en: "Clipper cut / Lineup" },
  "Rask maskinklipp eller lineup for deg som bare vil rydde opp rundt ører, nakke og hårlinje. Kort og effektivt – vær presis på oppmøtetid.":
    {
      en: "A quick clipper cut or lineup for when you just want to tidy up around the ears, neck and hairline. Short and efficient – please be on time.",
    },
  "Herreklipp 30'": { en: "Men's haircut 30'" },
  "En klipp for de fleste frisyrer. På 30 minutter rekker vi skinfade, taperfade og de fleste standard-klipp.":
    {
      en: "A cut for most styles. In 30 minutes we can do a skin fade, taper fade and most standard cuts.",
    },
  "Herreklipp 45'": { en: "Men's haircut 45'" },
  "For deg som vil ha litt ekstra tid – førstegangskunde, skinfade, classic cut, mullet eller mer krevende frisyrer, med tynning, teksturering og detaljer underveis.":
    {
      en: "For when you want a little extra time – first-time client, skin fade, classic cut, mullet or more demanding styles, with thinning, texturising and detailing along the way.",
    },
  Barneklipp: { en: "Kids' haircut" },
  "Klipp for barn under 12 år, hos hvilken som helst barber.": {
    en: "A haircut for children under 12, with any barber.",
  },

  // Kombo
  "Lett kombo": { en: "Light combo" },
  "Klipp og skjegg i samme sesjon. Skjegget formes og trimmes med maskin (uten hot towel) – en effektiv oppgradering fra vanlig klipp.":
    {
      en: "Haircut and beard in one session. The beard is shaped and trimmed with clippers (no hot towel) – an efficient upgrade from a regular cut.",
    },
  "Full kombo": { en: "Full combo" },
  "Full behandling med god tid: grundig klipp kombinert med komplett skjeggpleie og hot towel-barbering. Den komplette opplevelsen.":
    {
      en: "The full treatment with time to spare: a thorough cut combined with complete beard care and a hot-towel shave. The complete experience.",
    },

  // Skjegg
  "Lineup / skjeggtrim": { en: "Lineup / beard trim" },
  "Rask lineup og trim – skarpe, rene kanter på skjegget. Også fin som en kjapp oppfriskning mellom fulle behandlinger.":
    {
      en: "A quick lineup and trim – sharp, clean edges on the beard. Also great as a fast refresh between full treatments.",
    },
  Skjeggtrim: { en: "Beard trim" },
  "Forming, trimming og stell av skjegget med maskin og kniv, tilpasset ansiktsform.":
    {
      en: "Shaping, trimming and grooming of the beard with clippers and blade, tailored to your face shape.",
    },
  "Skjeggtrim deluxe": { en: "Beard trim deluxe" },
  "Full skjeggbehandling med hot towel, nøyaktig forming, barberkniv på kantene og pleieprodukter.":
    {
      en: "A full beard treatment with hot towel, precise shaping, straight razor on the edges and care products.",
    },

  // Barbering
  Hodebarbering: { en: "Head shave" },
  "Barbering av hodet med barberkniv og blad – ren, glatt finish med hot towel.":
    {
      en: "A head shave with straight razor and blade – a clean, smooth finish with hot towel.",
    },
  "Barbering (ansikt)": { en: "Shave (face)" },
  "Klassisk våtbarbering av ansiktet: hot towel, skum og barberblad for en tett, ren barbering.":
    {
      en: "A classic wet shave of the face: hot towel, lather and blade for a close, clean shave.",
    },
  "Barbering deluxe": { en: "Shave deluxe" },
  "Den fulle barberopplevelsen med ekstra tid, hot towel, forming og pleie – for en luksuriøs, tett barbering.":
    {
      en: "The full shaving experience with extra time, hot towel, shaping and care – for a luxurious, close shave.",
    },

  // Tillegg (tilleggstjenester – navnene settes i admin; disse er vanlige valg,
  // og ukjente verdier faller trygt tilbake til norsk).
  Hårvask: { en: "Hair wash" },
  "Hårvask og Føning": { en: "Hair wash & blow-dry" },
  "Hårvask og føning": { en: "Hair wash & blow-dry" },
  Føning: { en: "Blow-dry" },
  Hodebunnsmassasje: { en: "Scalp massage" },
  Nakkemassasje: { en: "Neck massage" },
  Ansiktsmassasje: { en: "Face massage" },
  Voks: { en: "Wax" },
  "Vask & styling": { en: "Wash & styling" },
  Styling: { en: "Styling" },
  "Hot towel": { en: "Hot towel" },
  Augbryn: { en: "Eyebrows" },
  Øyenbryn: { en: "Eyebrows" },
};

// ------------------------------------------------------------------ TITLER
// Stillingstitler på ansatte (vises i Teamet + barber-valg i booking).
// Nøklene er normalisert (se normalizeTitle i queries.ts).
const titles: ContentMap = {
  Barber: { en: "Barber" },
  "Junior Barber": { en: "Junior Barber" },
  "Senior Barber": { en: "Senior Barber" },
  "Master Barber": { en: "Master Barber" },
  Lærling: { en: "Apprentice" },
  Frisør: { en: "Hairdresser" },
};

// ----------------------------------------------------- SITE-SETTINGS + CRAFT
// Hero-/om-oss-/slagord-/cta-tekst (fallback-standarder) og håndverk-blokkene.
const settings: ContentMap = {
  // Slagord / hero
  "Skarpe linjer. Ingen snarveier.": { en: "Sharp lines. No shortcuts." },
  "Der presisjon møter stil": { en: "Where precision meets style" },
  "Sett deg ned.": { en: "Have a seat." },
  "Reis deg skarpere.": { en: "Rise sharper." },

  // Om oss
  "Siden 2013 har vi klippet Oslo midt i sentrum. Én idé hele veien: en barbershop der klippen faktisk sitter og praten går av seg selv. Erfarne barberere, skarpe verktøy og tid nok til å gjøre det ordentlig – et fast punkt i Oslo sentrum siden starten.":
    {
      en: "Since 2013 we've been cutting Oslo right in the city centre. One idea all the way: a barbershop where the cut actually holds and the conversation flows by itself. Experienced barbers, sharp tools and enough time to do it properly – a fixture in central Oslo since day one.",
    },
  "Vi åpnet i 2018 med én idé: en barbershop der klippen faktisk sitter og praten går av seg selv. Erfarne barberere, skarpe verktøy og tid nok til å gjøre det ordentlig – midt i Oslo.":
    {
      en: "We opened in 2018 with one idea: a barbershop where the cut actually holds and the conversation flows by itself. Experienced barbers, sharp tools and enough time to do it properly – in the heart of Oslo.",
    },

  // CTA
  "Klar for stolen?": { en: "Ready for the chair?" },
  "Velg tjeneste, barber og tid – booket på under ett minutt.": {
    en: "Choose service, barber and time – booked in under a minute.",
  },

  // Håndverket-blokkene (fallback-innhold)
  Faden: { en: "The Fade" },
  "Hud til topp i én ren overgang. Ingen kanter som skurrer.": {
    en: "Skin to top in one clean transition. No edges that jar.",
  },
  "Det varme håndkleet": { en: "The hot towel" },
  "Fem minutter der ingenting haster. Så barberkniven.": {
    en: "Five minutes where nothing is rushed. Then the razor.",
  },
  Finishen: { en: "The finish" },
  "Tekstur og hold som sitter – fra stolen til siste øl.": {
    en: "Texture and hold that lasts – from the chair to the last beer.",
  },
};

// ------------------------------------------------------------- ÅPNINGSTIDER
// Ukedagsnavn + «Stengt». Sammensatte etiketter (f.eks. «Mandag–Lørdag»)
// håndteres av <TDyn> ved å oversette hver del og sette dem sammen igjen.
const days: ContentMap = {
  Mandag: { en: "Monday" },
  Tirsdag: { en: "Tuesday" },
  Onsdag: { en: "Wednesday" },
  Torsdag: { en: "Thursday" },
  Fredag: { en: "Friday" },
  Lørdag: { en: "Saturday" },
  Søndag: { en: "Sunday" },
  Stengt: { en: "Closed" },
};

export const contentMaps: Record<string, ContentMap> = {
  services,
  settings,
  days,
  titles,
};

/**
 * Oversett én DB-verdi til gjeldende språk.
 *  • Direkte treff i kartet vinner.
 *  • Ellers: hvis strengen er en «–»-sammensetning (f.eks. ukedagsintervall)
 *    og ALLE delene finnes i kartet, oversettes hver del og settes sammen.
 *  • Ellers returneres den originale norske teksten (trygg fallback).
 */
export function translateContent(
  map: string,
  text: string,
  lang: Lang,
): string {
  if (lang !== "en") return text;
  const m = contentMaps[map];
  if (!m) return text;
  const direct = m[text];
  if (direct) return direct.en;
  if (text.includes("–")) {
    const parts = text.split("–");
    const mapped = parts.map((p) => m[p.trim()]?.en);
    if (mapped.every((x): x is string => Boolean(x))) return mapped.join("–");
  }
  return text;
}
