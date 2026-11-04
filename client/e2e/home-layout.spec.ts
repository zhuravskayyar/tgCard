import { expect, test, type APIRequestContext } from "@playwright/test";

let noviceSession: { sessionToken: string; player: { level: number } } | undefined;

async function getNoviceSession(request: APIRequestContext) {
  if (!noviceSession) {
    const response = await request.post("/api/auth/guest");
    expect(response.ok()).toBe(true);
    noviceSession = await response.json();
  }
  expect(noviceSession?.player.level).toBe(1);
  return noviceSession!;
}

test("novice home keeps artwork separate from labels at short and narrow sizes", async ({ page, request }) => {
    const { sessionToken } = await getNoviceSession(request);
    await page.addInitScript((token) => localStorage.setItem("cardastika.session.token", token), sessionToken);

    for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 668 }, { width: 430, height: 932 }, { width: 668, height: 375 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.locator(".home-menu .menu-row__detail").first()).toHaveText("Пізніше");
      await page.evaluate(() => document.fonts.ready);
      const defects = await page.locator(".home-menu .menu-row").evaluateAll((rows) => {
        const failures: string[] = [];
        const overlaps = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        for (const row of rows) {
          if (Math.round(row.getBoundingClientRect().height) < 44) failures.push("short touch target");
          const art = row.querySelector(".menu-row__illustration")!.getBoundingClientRect();
          for (const element of row.querySelectorAll(".menu-row__title,.menu-row__action")) {
            if (!element.textContent?.trim()) continue;
            const rect = element.getBoundingClientRect();
            if (overlaps(art, rect)) failures.push(`art overlaps ${element.textContent}`);
            const range = document.createRange();
            range.selectNodeContents(element);
            for (const text of range.getClientRects()) {
              if (text.left < rect.left - 1 || text.right > rect.right + 1 || text.top < rect.top - 1 || text.bottom > rect.bottom + 1) failures.push(`clipped ${element.textContent}`);
            }
          }
        }
        return failures;
      });
      expect(defects, `${viewport.width}×${viewport.height}`).toEqual([]);
      const contrast = await page.locator('[data-mode="tournament"] .mode-tile__status').evaluate((element) => {
        const luminance = (color: string) => {
          const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => value / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
          return .2126 * r + .7152 * g + .0722 * b;
        };
        const style = getComputedStyle(element);
        const a = luminance(style.color);
        const b = luminance(style.backgroundColor);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      const settingsBox = await page.locator(".home-settings-button").boundingBox();
      expect(settingsBox?.width).toBeGreaterThanOrEqual(44);
      expect(settingsBox?.height).toBeGreaterThanOrEqual(44);

      const closeReward = page.locator(".daily-login-modal__close");
      if (await closeReward.isVisible()) await closeReward.click();
      await page.locator(".app-content").evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      const lastRow = await page.locator(".home-menu .menu-row").last().boundingBox();
      const nav = await page.locator(".bottom-navigation").boundingBox();
      expect(lastRow!.y + lastRow!.height).toBeLessThanOrEqual(nav!.y - 4);
      await expect(page.locator(".bottom-navigation button")).toHaveText(["Головна", "Профіль", "Гільдія"]);
    }
  });

test("settings fit provider widgets and section titles inside their frames after resizing", async ({ page, request }) => {
  const { sessionToken } = await getNoviceSession(request);
  await page.addInitScript((token) => {
    localStorage.setItem("cardastika.session.token", token);
    // Model the external widget's fixed requested width, without opening sign-in.
    (window as Window & { google: unknown }).google = { accounts: { id: {
      initialize() {},
      renderButton(container: HTMLElement, options: { width: number }) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Google";
        button.style.width = `${options.width}px`;
        button.style.height = "44px";
        container.append(button);
      },
    } } };
  }, sessionToken);
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto("/settings");
  await expect(page.locator(".google-sign-in button")).toBeVisible();
  for (const width of [430, 320, 375]) {
    await page.setViewportSize({ width, height: 668 });
    await expect.poll(() => page.locator(".settings-provider").evaluateAll((providers) => providers.every((provider) => {
      const parent = provider.getBoundingClientRect();
      return [...provider.children].every((child) => { const rect = child.getBoundingClientRect(); return rect.width > 0 && rect.left >= parent.left - 1 && rect.right <= parent.right + 1; });
    }))).toBe(true);
    const titleOffsets = await page.locator(".settings-section").evaluateAll((sections) => sections.map((section) => section.querySelector("h2")!.getBoundingClientRect().top - section.getBoundingClientRect().top));
    expect(titleOffsets.every((offset) => offset >= 18)).toBe(true);
  }
  await expect(page.locator(".settings-provider__hint")).toContainText("Відкрий гру в Telegram");
  await expect(page.locator('iframe[src*="oauth.telegram.org"]')).toHaveCount(0);
});

test("empty equipment slots explain their type without pretending an item is equipped", async ({ page, request }) => {
  const { sessionToken } = await getNoviceSession(request);
  await page.addInitScript((token) => localStorage.setItem("cardastika.session.token", token), sessionToken);
  await page.goto("/profile");
  const emptySlots = page.locator('.eq-doll__slot[aria-label$="порожньо"]');
  await expect(emptySlots.first()).toBeVisible();
  expect(await emptySlots.count()).toBeGreaterThan(0);
  expect(await emptySlots.locator(".eq-frame__empty").count()).toBe(await emptySlots.count());
  expect(await emptySlots.first().getAttribute("aria-label")).toContain("порожньо");
});
