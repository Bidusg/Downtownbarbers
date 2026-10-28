/**
 * «Plassholder-kunder»: rader som ikke er en ekte person, men en felles
 * oppsamling av walk-ins (f.eks. «Drop-in» fra Fixit-importen, eller en
 * kunde kassa har opprettet uten navn). Slike rader skal aldri tjene opp
 * klippekort – ellers får neste drop-in «gratis klipp» for alle andres besøk.
 */
const PLACEHOLDER = /^(drop[\s-]?in|walk[\s-]?in|kunde|ukjent|ukjent kunde|anonym|guest|gjest|n\/a|-|—)$/i;

export function isPlaceholderName(name: string | null | undefined): boolean {
  return PLACEHOLDER.test((name ?? "").trim());
}
