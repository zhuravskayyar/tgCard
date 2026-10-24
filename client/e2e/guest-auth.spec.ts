import { expect, test } from "@playwright/test";

const guestPlayer = {
  id: "00000000-0000-4000-8000-000000000901",
  firstName: "Сірий маг #48271",
  username: null,
  nickname: null,
  photoUrl: null,
  level: 1,
  accountXp: 0,
  accountXpRequired: 100,
  silver: 1_500,
  gold: 0,
  tutorialEligible: true,
};

const guestSession = {
  player: guestPlayer,
  sessionProvider: "guest",
  sessionToken: "playwright-guest-session",
  identities: [],
};

const guestAuthState = {
  player: guestPlayer,
  sessionProvider: "guest",
  identities: [],
  accountProtection: { status: "locked", rewardDiamonds: 5 },
};

test("guest start creates a protected session and ignores rapid repeat clicks", async ({ page }) => {
  let createRequests = 0;
  await page.route("**/api/auth/guest", async (route) => {
    createRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(guestSession) });
  });
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(guestAuthState),
  }));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "КАРДАСТІКА" })).toBeVisible();
  const startButton = page.locator(".auth-screen__start-button");
  await startButton.click();
  await expect(startButton).toBeDisabled();
  await startButton.evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator(".top-hud")).toContainText("Сірий маг #48271");
  expect(createRequests).toBe(1);
  await expect(page.locator(".auth-screen")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("cardastika.session.token"))).toBe("playwright-guest-session");
  await page.reload();
  await expect(page.locator(".top-hud")).toContainText("Сірий маг #48271");
  expect(createRequests).toBe(1);
});

test("landing dialog is keyboard accessible and fits narrow mobile widths", async ({ page }) => {
  await page.route("https://accounts.google.com/**", (route) => route.abort());
  await page.route("https://telegram.org/js/**", (route) => route.abort());
  await page.goto("/");

  const accountButton = page.getByRole("button", { name: "У мене вже є акаунт" });
  await accountButton.click();
  const dialog = page.getByRole("dialog", { name: "Увійти в акаунт" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Закрити" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(accountButton).toBeFocused();

  for (const width of [320, 360, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const dimensions = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(dimensions.document, `landing overflows ${width}px viewport`).toBeLessThanOrEqual(dimensions.viewport);
    const start = await page.getByRole("button", { name: "Почати нову гру" }).boundingBox();
    expect(start).not.toBeNull();
    expect(start!.x).toBeGreaterThanOrEqual(0);
    expect(start!.x + start!.width).toBeLessThanOrEqual(width + 1);
    await accountButton.click();
    const dialog = page.getByRole("dialog", { name: "Увійти в акаунт" });
    const dialogBounds = await dialog.boundingBox();
    expect(dialogBounds).not.toBeNull();
    expect(dialogBounds!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(width + 1);
    await dialog.getByRole("button", { name: "Скасувати" }).click();
  }
});

test("Telegram Mini App waits for an explicit return-account choice", async ({ page }) => {
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) => route.abort());
  await page.addInitScript(() => {
    Object.assign(window, {
      Telegram: { WebApp: { initData: "signed-mini-app-init-data", ready: () => undefined, expand: () => undefined } },
    });
  });
  let telegramLogins = 0;
  await page.route("**/api/auth/telegram", async (route) => {
    telegramLogins += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ...guestSession,
      player: { ...guestPlayer, firstName: "Мандрівник", tutorialEligible: false },
      sessionProvider: "telegram",
      identities: [{ provider: "telegram", email: null, createdAt: "2026-10-24T00:00:00.000Z" }],
    }) });
  });
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ...guestAuthState,
      player: { ...guestPlayer, firstName: "Мандрівник", tutorialEligible: false },
      sessionProvider: "telegram",
      accountProtection: { status: "not_applicable", rewardDiamonds: 5 },
      identities: [{ provider: "telegram", email: null, createdAt: "2026-10-24T00:00:00.000Z" }],
    }),
  }));

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Почати нову гру" })).toBeVisible();
  expect(telegramLogins).toBe(0);
  await page.getByRole("button", { name: "У мене вже є акаунт" }).click();
  const dialog = page.getByRole("dialog", { name: "Увійти в акаунт" });
  await dialog.getByRole("button", { name: "Продовжити через Telegram" }).click();
  await expect(page.locator(".top-hud")).toContainText("Мандрівник");
  expect(telegramLogins).toBe(1);
});

test("account protection appears after the tutorial and awards diamonds once", async ({ page }) => {
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem("cardastika.session.token", "playwright-guest-session");
    Object.assign(window, {
      Telegram: { WebApp: { initData: "signed-mini-app-init-data", ready: () => undefined, expand: () => undefined } },
    });
  });
  let tutorialComplete = false;
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ...guestAuthState,
      player: { ...guestPlayer, tutorialEligible: !tutorialComplete },
      accountProtection: { status: tutorialComplete ? "available" : "locked", rewardDiamonds: 5 },
    }),
  }));
  let linkRequests = 0;
  let linkBody: Record<string, unknown> | null = null;
  await page.route("**/api/auth/link", async (route) => {
    linkRequests += 1;
    linkBody = route.request().postDataJSON() as Record<string, unknown>;
    await new Promise((resolve) => setTimeout(resolve, 160));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ identities: [{ provider: "telegram", email: null, createdAt: "2026-10-24T00:00:00.000Z" }], replacedExisting: false, rewardGranted: true }),
    });
  });

  await page.goto("/tasks");
  await expect(page.locator(".tasks-screen")).toBeVisible();
  await expect(page.getByText("Захисти свій прогрес")).toHaveCount(0);
  tutorialComplete = true;
  await page.goto("/tasks");
  await expect(page.getByText("Захисти свій прогрес")).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  const linkButton = page.getByRole("button", { name: "Прив’язати Telegram" });
  await linkButton.click();
  const pendingButton = page.getByRole("button", { name: "Прив’язуємо…" });
  await expect(pendingButton).toBeDisabled();
  await pendingButton.evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole("status")).toContainText("Отримано 5 діамантів");
  expect(linkRequests).toBe(1);
  expect(linkBody).toEqual({ provider: "telegram", initData: "signed-mini-app-init-data" });
  await expect(page.getByText("Профіль захищено.")).toBeVisible();
  expect(await page.locator(".tasks-screen__account-protection").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
});
