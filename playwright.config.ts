import { defineConfig, devices } from "@playwright/test";

/* =====================================================================
 * Automatiske tester (Playwright) for Downtown Barbers.
 *
 *   npm run test:e2e         → bygger ikke; starter `next start` lokalt
 *                              (kjør `npm run build` først) og tester den.
 *   npm run test:e2e:prod    → tester den ekte nettsiden (kun lesing –
 *                              lager aldri bookinger eller endrer data).
 *   npx playwright show-report → åpner rapporten med skjermbilder.
 *
 * Første gang på en ny maskin: `npx playwright install chromium`.
 * ===================================================================== */

const PROD = process.env.E2E_TARGET === "prod";
const baseURL = process.env.E2E_BASE_URL ?? (PROD ? "https://downtownbarbers.no" : "http://localhost:3210");
// Egen Chromium (f.eks. i sky-miljøer) – ellers Playwrights egen.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    navigationTimeout: 60_000,
    screenshot: "only-on-failure",
    reducedMotion: "reduce",
    locale: "nb-NO",
    timezoneId: "Europe/Oslo",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "mobil", use: { ...devices["iPhone 13"], browserName: "chromium", launchOptions: { executablePath } } },
    { name: "ipad", use: { ...devices["iPad (gen 7) landscape"], browserName: "chromium", launchOptions: { executablePath } } },
    { name: "pc", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath } } },
  ],
  webServer: PROD || process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npx next start -p 3210",
        url: "http://localhost:3210",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
