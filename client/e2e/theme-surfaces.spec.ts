import { expect, test, type Page } from "@playwright/test";

async function openScreen(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator(".top-hud")).toContainText("dev_leader");
  await page.waitForTimeout(200);
  const closeReward = page.locator(".daily-login-modal__close");
  if (await closeReward.isVisible()) await closeReward.click();
  const intro = page.getByRole("button", { name: "ЗРОЗУМІЛО", exact: true });
  if (await intro.isVisible()) await intro.click();
}

test("parchment theme keeps screens, artwork and the player shell usable at mobile widths", async ({ page, request }) => {
    test.setTimeout(180_000);
    const login = await request.post("/api/dev/login", { data: { accountKey: "guild_leader" } });
    expect(login.ok()).toBe(true);
    const { sessionToken } = await login.json();
    await page.addInitScript((token) => {
      if (window.top === window) localStorage.setItem("cardastika.session.token", token);
    }, sessionToken as string);
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    const paths = ["/", "/deck", "/shop", "/profile", "/settings", "/inventory", "/cards/weak", "/collections", "/equipment", "/forge", "/duel", "/arena", "/guild", "/tasks", "/battle-pass", "/mail", "/leagues"];

    for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 668 }, { width: 430, height: 932 }]) {
      const { width } = viewport;
      await page.setViewportSize(viewport);
      for (const path of paths) {
        await openScreen(page, path);
        await expect(page.locator(".top-hud")).toHaveCount(1);
        await expect(page.locator(".bottom-navigation button")).toHaveText(["Головна", "Профіль", "Гільдія"]);
        const layout = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
        }));
        expect(layout.content, `${width}px ${path}`).toBeLessThanOrEqual(layout.viewport);
        if (path !== "/") await expect(page.locator(".screen-heading").first()).toBeVisible();
        if (path === "/duel") {
          const panel = page.locator(".duel-search-experience");
          await expect(panel).toBeVisible();
          await expect(panel).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
          await expect(panel).toHaveCSS("box-shadow", "none");
          await expect(panel).toHaveCSS("border-top-width", "0px");
          expect(await panel.evaluate((element) => getComputedStyle(element).borderImageSource)).toContain("theme-book");
        }
      }
      await openScreen(page, "/deck");
      await page.locator(".deck-grid button").first().click();
      await expect(page.locator(".card-detail-actions .menu-row")).toHaveText([/Колода/, /Слабкі карти/, /Магазин/]);
      await expect(page.locator(".top-hud")).toBeVisible();
      await expect(page.locator(".bottom-navigation")).toBeVisible();
      await expect(page.locator(".card-detail-screen > .screen-heading")).toHaveCount(1);
    }
    expect(runtimeErrors).toEqual([]);
  });

test("the only parchment theme is applied on load", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-game-theme", "light");
});

test("shared heading back buttons preserve the deck and card return routes", async ({ page, request }) => {
  const login = await request.post("/api/dev/login", { data: { accountKey: "guild_leader" } });
  const { sessionToken } = await login.json();
  await page.goto("/");
  await page.evaluate((token) => localStorage.setItem("cardastika.session.token", token), sessionToken as string);
  await openScreen(page, "/deck");
  await page.locator(".screen-heading__back").click();
  await expect(page.locator(".home-screen")).toBeVisible();
  await openScreen(page, "/deck");
  await page.locator(".deck-grid button").first().click();
  await expect(page.locator(".card-detail-screen")).toBeVisible();
  const ink = await page.locator(".card-protection-toggle > span:not(.card-protection-toggle__switch)").evaluate((element) => getComputedStyle(element).color);
  expect(ink).toBe("rgb(45, 27, 14)");
  const currencyInk = await page.locator(".currency-display__value").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.color, fill: style.webkitTextFillColor };
  });
  expect(currencyInk.fill).toBe(currencyInk.color);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.locator(".deck-screen")).toBeVisible();
  await expect(page.locator(".top-hud")).toContainText("dev_leader");
});
