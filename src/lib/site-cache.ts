/**
 * Nettsidens faste oppsett (seksjoner av/på, tekster, engelske oversettelser,
 * sporing) leses på HVER side via rot-layouten. Det mellomlagres derfor i
 * 5 minutter, og tømmes med en gang admin lagrer en endring (SITE_TAG).
 */
export const SITE_TAG = "site-config";
export const SITE_REVALIDATE = 300;
