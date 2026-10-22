import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

/* Bookingflyten – går gjennom stegene, men sender ALDRI inn en booking. */

async function velgForsteTjeneste(page: Page) {
  await page.goto("/booking");
  await expect(page.getByRole("heading", { name: "Hva vil du ha?" })).toBeVisible();
  const kort = page.locator("li button[aria-pressed]").first();
  await kort.click();
  await expect(kort).toHaveAttribute("aria-pressed", "true");
}

test.describe("Booking", () => {
  test("steg 1 → 2, tilbake-knapp og nettleserens tilbake", async ({ page }) => {
    await velgForsteTjeneste(page);
    await expect(page.getByText(/valgt ·/)).toBeVisible(); // bunnlinjen
    await page.getByRole("button", { name: "Velg tid" }).click();
    await expect(page.getByRole("heading", { name: "Når passer det?" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Hvilken som helst/ })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Tilbake" }).click();
    await expect(page.getByRole("heading", { name: "Hva vil du ha?" })).toBeVisible();

    await page.goForward();
    await expect(page.getByRole("heading", { name: "Når passer det?" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Hva vil du ha?" })).toBeVisible();
  });

  test("valgene huskes når siden lastes på nytt", async ({ page }) => {
    await velgForsteTjeneste(page);
    await page.reload();
    await expect(page.locator('li button[aria-pressed="true"]')).toHaveCount(1);
  });

  test("ledige tider vises eller tydelig melding", async ({ page }) => {
    await velgForsteTjeneste(page);
    await page.getByRole("button", { name: "Velg tid" }).click();
    const tid = page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
    const tom = page.getByText(/Ingen ledige tider|Finner ingen/).first();
    await expect(tid.or(tom)).toBeVisible({ timeout: 20_000 });
  });

  test("bekreft-steget viser feil og flytter fokus – uten å sende inn", async ({ page }) => {
    await page.goto("/booking");
    const navn = await page.locator("li button[aria-pressed] span.font-semibold").first().textContent();
    const om7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    await page.evaluate(
      ([n, d]) =>
        sessionStorage.setItem(
          "dtb-booking-v2",
          JSON.stringify({ cart: [{ s: (n ?? "").replace(/​/g, ""), a: [], b: null, p: "" }], mode: "single", barber: "__any__", step: 2, date: d, time: "14:00" }),
        ),
      [navn, om7],
    );
    await page.evaluate(() => localStorage.removeItem("dtb-kunde"));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Bekreft timen" })).toBeVisible();
    await page.getByRole("button", { name: /Fullfør booking/ }).click();
    await expect(page.locator("#bk-name")).toBeFocused();
    await expect(page.getByText("Skriv inn navnet ditt.")).toBeVisible();
    await page.locator("#bk-phone").fill("912");
    await page.locator("#bk-phone").blur();
    await expect(page.getByText(/8 sifre/)).toBeVisible();
  });

  test("ingen sidelengs scroll", async ({ page }) => {
    await page.goto("/booking");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
