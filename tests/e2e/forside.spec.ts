import { test, expect } from "./fixtures";

test.describe("Forsiden", () => {
  test("laster med overskrift, bestill-knapp og ingen sidelengs scroll", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Downtown Barbers" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Bestill time" }).first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "siden skal ikke kunne scrolles sidelengs").toBeLessThanOrEqual(1);
  });

  test("seksjonene finnes", async ({ page }) => {
    await page.goto("/");
    for (const id of ["team", "tjenester", "kontakt"]) {
      await expect(page.locator(`#${id}`), `#${id} mangler (kan være skrudd av i admin)`).toHaveCount(1);
    }
  });

  test("bytte til engelsk og tilbake", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "EN", exact: true }).first().click();
    await expect(page.getByRole("link", { name: "Book now" }).first()).toBeVisible();
    await page.getByRole("button", { name: "NO", exact: true }).first().click();
    await expect(page.getByRole("link", { name: "Bestill time" }).first()).toBeVisible();
  });

  test("mobilmenyen åpnes og lukkes med Esc", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1000) >= 768, "hamburgermenyen finnes bare på mobil");
    await page.goto("/");
    await page.getByRole("button", { name: "Åpne meny" }).click();
    await expect(page.getByRole("navigation", { name: "Meny" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("navigation", { name: "Meny" })).toBeHidden();
  });

  test("skjermbilde", async ({ page }, info) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await info.attach("forside", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });
});
