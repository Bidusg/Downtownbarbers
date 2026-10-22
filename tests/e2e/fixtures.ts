import { test as base, expect } from "@playwright/test";

/**
 * Felles oppsett: stopp kall til eksterne tjenester (Google Maps-kartet,
 * anmeldelsesbilder o.l.). Testene handler om vår egen side, og eksterne
 * kall gjør dem trege og ustabile.
 */
export const test = base.extend({
  page: async ({ page, baseURL }, run) => {
    const own = new URL(baseURL ?? "http://localhost").host;
    await page.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.protocol === "data:" || u.host === own) return route.continue();
      return route.abort();
    });
    await run(page);
  },
});
export { expect };
