/**
 * Ambient-deklarasjoner for archiver-pakkene som ikke har egne typer.
 * Bruken i src/lib/zip.ts caster uansett til `any`; dette gir kun modulen
 * en deklarasjon så TypeScript ikke feiler på manglende typer.
 */
declare module "archiver";
declare module "archiver-zip-encrypted";
