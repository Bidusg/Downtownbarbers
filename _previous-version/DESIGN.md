# Design

Varm monokrom i to likeverdige moduser som følger `prefers-color-scheme`.
Referansefamilie: Aesop-varm retail-minimalisme — lin, ikke laboratorium.
CTA-er er invertert blekk; merkeoransjen fra originalsiden (#F47721)
bærer mikroetiketter og kuraterte detaljer som eneste kromatiske stemme.

## Theme

- **Lys (standard):** lin-lerret, espresso-tekst. En skredderstue i dagslys.
- **Mørk:** espresso-lerret, lin-tekst. Samme rom etter stengetid.
- Byttes automatisk via `prefers-color-scheme`; ingen JS-toggle. `color-scheme: light dark` er satt, og `<meta name="theme-color">` følger begge moduser (`app/layout.tsx`).

## Colors

Alle tokens er OKLCH-tripler i `app/globals.css` (`:root` + dark-media-query),
konsumert i `tailwind.config.ts` som `oklch(var(--x) / <alpha-value>)`.
Semantiske navn — aldri råfarger i komponenter.

| Token | Lys | Mørk | Rolle |
|---|---|---|---|
| `canvas` | 97.3% 0.007 85 | 16.5% 0.008 45 | Sidebakgrunn |
| `surface` | 99.2% 0.004 85 | 20% 0.009 45 | Kort, modaler, inputs |
| `surface-2` | 93.8% 0.009 85 | 24% 0.01 45 | Resesserte seksjoner, hover |
| `fg` | 23% 0.012 50 | 94% 0.009 85 | Primærtekst |
| `fg-soft` | 30% 0.014 50 | 88% 0.012 85 | Sekundær-hover på fg-flater |
| `muted` | 47% 0.014 60 | 66% 0.014 70 | Sekundærtekst, etiketter |
| `line` | 88% 0.01 82 | 29% 0.01 50 | Standard delelinjer/rammer |
| `line-2` | 80% 0.012 80 | 37% 0.012 55 | Sterkere rammer, scrollbar |
| `accent` | = fg | = fg | CTA-blokker (invertert blekk) |
| `accent-hover` | 32% 0.015 50 | 86% 0.014 80 | CTA-hover |
| `accent-soft` | 58% 0.17 42 | 70% 0.17 45 | Merkeoransje (fra #F47721): mikroetiketter, kuraterte ord. Lys modus er en dypere, brent utgave for kontrast på lin; mørk modus er tilnærmet ren #F47721 |
| `accent-fg` | = canvas (lys) | = canvas (mørk) | Tekst PÅ accent-flater |
| `danger` | 44% 0.15 27 | 70% 0.13 22 | Feilmeldinger |

Regler:
- Tekst på `bg-accent` bruker alltid `text-accent-fg`, aldri `text-fg`.
- `accent-soft` er den eneste kromatiske stemmen — brukes sparsomt (italic-ord i overskrifter, tellere, understreker). Aldri som flatefarge. Verdien er avledet av merkeoransjen #F47721 fra downtownbarbers.no.
- Funksjonsfarger beholdes: Vipps-oransje `#FF5B24`, suksess `#10B981`, feil-ikoner `#EF4444`, barber-identitetsfarger i admin-kalenderen.
- E-postmalen (`app/api/booking-confirmation`) beholder sitt faste mørke design — e-postklienter følger ikke systemtema pålitelig.

## Typography

- **Display:** Playfair Display (`font-display`) — etablert identitet. Store `clamp()`-skalaer, `leading-[0.88]`, italic normalvekt som kontrastord.
- **Body/UI:** Inter (`font-sans`). Mikroetiketter: 9–10px uppercase med 0.2–0.35em tracking.

## Layout & sections

Landingssidens seksjonsrytme (lys modus): lin → `surface-2` (About) → lin (Services) → **`accent`-statementblokk (Shop)** → `surface-2` (Team) → lin. Én invertert blokk per side; den inverteres naturlig med i mørk modus. Skarpe hjørner overalt — ingen border-radius (unntatt scrollbar).

## Motion

Framer-motion: entrance-reveals med `[0.25, 0, 0, 1]` / `[0.16, 1, 0.3, 1]`-kurver, staggered team-grid. `prefers-reduced-motion` respekteres via `scroll-behavior: auto`-fallback; nye animasjoner skal degradere til ren opacity.

## Accessibility

WCAG AA verifisert på tokennivå: brødtekst ≥4.5:1, muted ≥4.5:1 på canvas. `accent-soft` holder ≥3:1 i lys modus (kun store display-ord og dekorative detaljer) og ≥4.5:1 i mørk — bruk den ikke på liten brødtekst i lys modus. Synlig `:focus-visible`-outline i accent-soft. Fargebruk bærer aldri mening alene.
