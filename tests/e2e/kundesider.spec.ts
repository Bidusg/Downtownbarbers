import { test, expect } from "./fixtures";

/* Kundesider med ugyldige lenker – trygt å kjøre mot den ekte nettsiden. */
const NULL_TOKEN = "00000000-0000-0000-0000-000000000000";

test("Min side med ugyldig lenke gir tydelig melding", async ({ page }) => {
  await page.goto(`/min-side/${NULL_TOKEN}`);
  await expect(page.getByRole("heading", { name: "Fant ikke siden" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Til forsiden" })).toBeVisible();
});

test("Avbestilling med ugyldig lenke", async ({ page }) => {
  await page.goto(`/avbestill/${NULL_TOKEN}`);
  await expect(page.getByRole("heading", { name: "Fant ikke timen" })).toBeVisible();
});

test("Avmelding viser spørsmål og knapper", async ({ page }) => {
  await page.goto(`/avmeld/${NULL_TOKEN}`);
  await expect(page.getByRole("heading", { name: /Meld deg av/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ja, meld meg av" })).toBeVisible();
});

test("Innlogging: feltene har etiketter", async ({ page }) => {
  await page.goto("/?login=1");
  await expect(page.getByLabel(/e-post/i).first()).toBeVisible();
});
