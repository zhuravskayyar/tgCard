import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function closeDailyRewardIfOpen(page: Page, settleMs = 700) {
  const dialog = page.locator(".daily-login-modal__dialog");
  await page.waitForTimeout(settleMs);
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.locator(".daily-login-modal__close").click();
    await expect(page.locator(".daily-login-modal")).toBeHidden();
  }
}

async function signInAsDevPlayer(page: Page, accountKey: string) {
  // Outside Telegram the game opens in English; these checks read the Ukrainian interface.
  await page.addInitScript(() => localStorage.setItem("cardastika.locale.v1", "uk"));
  await page.goto("/");
  await page.getByLabel("Тестовий локальний акаунт").selectOption(accountKey);
  await expect(page.locator(".bottom-navigation")).toBeVisible();
  await closeDailyRewardIfOpen(page);
  await expect(page.getByRole("navigation", { name: "Головна навігація" }).getByRole("button")).toHaveCount(3);
}

// Dev accounts start in the guided first duel; finish it so the home screen and shop open.
async function finishTutorial(request: APIRequestContext, accountKey: string) {
  const login = await request.post("/api/dev/login", { data: { accountKey } });
  expect(login.ok()).toBe(true);
  const { sessionToken } = await login.json();
  const done = await request.post("/api/player/tutorial/complete", { headers: { Authorization: `Bearer ${sessionToken}` } });
  expect(done.ok()).toBe(true);
}

async function openPath(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".bottom-navigation")).toBeVisible();
  await closeDailyRewardIfOpen(page);
  const arenaIntro = page.getByRole("button", { name: "ЗРОЗУМІЛО" });
  if (await arenaIntro.isVisible().catch(() => false)) await arenaIntro.click();
}

async function expectNoHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(sizes.document, `document wider than ${sizes.viewport}px viewport`).toBeLessThanOrEqual(sizes.viewport);

  const navButtonsStayVisible = await page.locator(".bottom-navigation button").evaluateAll((buttons) =>
    buttons.every((button) => {
      const rect = button.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= window.innerWidth + 1;
    }),
  );
  expect(navButtonsStayVisible).toBe(true);
}

test("opens the requested screens at 320, 360, and 430 px without horizontal overflow", async ({ page }) => {
  test.setTimeout(90_000);
  await signInAsDevPlayer(page, "player_regular");

  const routes = [
    { path: "/", selector: ".home-screen" },
    { path: "/deck", selector: ".deck-screen" },
    { path: "/shop", selector: ".shop-screen" },
    { path: "/equipment", selector: ".equipment-screen" },
    { path: "/forge", selector: ".forge-screen" },
    { path: "/collections", selector: ".bestiary" },
    { path: "/duel", selector: ".duel-search-screen, .duel-battle" },
    { path: "/arena", selector: ".arena-screen" },
    { path: "/guild", selector: ".guild-screen" },
  ];

  for (const width of [320, 360, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      await openPath(page, route.path);
      await expect(page.locator(route.selector)).toBeVisible();
      await expectNoHorizontalOverflow(page);
      if (route.path === "/arena") {
        await page.getByRole("button", { name: "Рейтинг арени", exact: true }).click();
        await expect(page.locator(".arena-screen")).toContainText("Рейтинг арени");
        await expectNoHorizontalOverflow(page);
        await page.getByRole("button", { name: "Назад", exact: true }).click();
      }
    }
  }
});

test("card dialogs support focus, cancel, errors, and reversible protection", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await signInAsDevPlayer(page, "guild_leader");

  await page.getByRole("button", { name: "Колода", exact: true }).click();
  const card = page.locator(".deck-grid button").first();
  await card.waitFor();
  await card.click();
  await expect(page.locator(".card-detail-screen")).toBeVisible();
  // A single weak card is absorbed at once; the confirmation dialog guards the bulk "absorb weak" action.
  const bulkButton = page.locator(".absorb-weak-button");
  await expect(bulkButton).toBeEnabled();

  await bulkButton.click();
  const absorptionDialog = page.getByRole("dialog", { name: "Поглинути слабкі карти?" });
  await expect(absorptionDialog).toBeVisible();
  await expect(absorptionDialog.getByRole("button", { name: "Скасувати" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(absorptionDialog).toBeHidden();

  await bulkButton.click();
  let absorptionRequests = 0;
  await page.route((url) => url.pathname.startsWith("/api/player/cards/") && url.pathname.endsWith("/absorb-weak"), async (route) => {
    absorptionRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "protected_card" } }),
    });
  });
  const absorbButton = absorptionDialog.getByRole("button", { name: "Поглинути", exact: true });
  await absorbButton.click();
  const busyAbsorbButton = absorptionDialog.getByRole("button", { name: "Поглинання…" });
  await expect(busyAbsorbButton).toBeDisabled();
  await busyAbsorbButton.evaluate((button: HTMLButtonElement) => button.click());
  await expect(absorptionDialog.getByRole("alert")).toHaveText("Захищену карту не можна поглинути.");
  expect(absorptionRequests).toBe(1);
  await expect(absorptionDialog).toBeVisible();
  await page.unrouteAll();
  await absorptionDialog.getByRole("button", { name: "Скасувати" }).click();
  await expect(absorptionDialog).toBeHidden();

  const levelUp = page.locator(".level-up-button:not(.absorb-weak-button)");
  if (await levelUp.isEnabled()) {
    await levelUp.click();
    const levelDialog = page.getByRole("dialog", { name: "Підняти рівень?" });
    await expect(levelDialog).toBeVisible();
    await expect(levelDialog).toContainText("золота");
    await levelDialog.getByRole("button", { name: "Скасувати" }).click();
    await expect(levelDialog).toBeHidden();
  }

  const protection = page.getByRole("switch");
  const initialProtection = await protection.getAttribute("aria-checked");
  await protection.click();
  await expect(protection).toHaveAttribute("aria-checked", initialProtection === "true" ? "false" : "true");
  const successFeedback = page.locator(".action-feedback--success");
  const firstProtectionMessage = initialProtection === "true" ? "Захист карти вимкнено." : "Захист карти увімкнено.";
  const secondProtectionMessage = initialProtection === "true" ? "Захист карти увімкнено." : "Захист карти вимкнено.";
  await expect(successFeedback).toContainText(firstProtectionMessage);
  expect(await successFeedback.evaluate((element) => getComputedStyle(element).animationName)).toBe("card-detail-feedback-enter");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await protection.click();
  await expect(protection).toHaveAttribute("aria-checked", initialProtection ?? "false");
  await expect(successFeedback).toContainText(secondProtectionMessage);
  expect(await successFeedback.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  expect(runtimeErrors).toEqual([]);
});

test("equipment saves on the server, survives reload, and can be restored", async ({ page }) => {
  await signInAsDevPlayer(page, "guild_leader");
  await page.getByRole("button", { name: /^Спорядження/ }).click();
  await expect(page.getByRole("heading", { name: "СПОРЯДЖЕННЯ" })).toBeVisible();
  await page.getByRole("tab", { name: /Артефакти/ }).click();
  const item = page.locator(".eq-rack__item").first();
  await item.waitFor();
  const amuletSlot = page.getByRole("button", { name: "Оберіг другого подиху: порожньо" });
  if (await amuletSlot.count() === 0) {
    await item.click();
    const existingSheet = page.locator(".eq-card");
    if (await existingSheet.getByRole("button", { name: "Зняти" }).count()) {
      await existingSheet.getByRole("button", { name: "Зняти" }).click();
      await existingSheet.waitFor({ state: "hidden" });
    }
  }
  await item.click();
  const sheet = page.locator(".eq-card");
  await expect(sheet).toBeVisible();

  await page.route((url) => url.pathname === "/api/player/equipment", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable" } }) });
  });
  const equipButton = sheet.getByRole("button", { name: "Одягнути" });
  await equipButton.click();
  await expect(sheet.getByRole("button", { name: "Зберігаємо…" })).toBeDisabled();
  await expect(sheet.getByRole("alert")).toBeVisible();
  await expect(sheet).toBeVisible();
  await page.unrouteAll();

  await sheet.getByRole("button", { name: "Одягнути" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: "Оберіг другого подиху: Оберіг другого подиху · Міфічна" })).toBeVisible();

  await page.reload();
  await closeDailyRewardIfOpen(page, 1_000);
  await expect(page.getByRole("heading", { name: "СПОРЯДЖЕННЯ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Оберіг другого подиху: Оберіг другого подиху · Міфічна" })).toBeVisible();
  await page.getByRole("tab", { name: /Артефакти/ }).click();
  await page.locator(".eq-rack__item").first().click();
  const equippedSheet = page.locator(".eq-card");
  await equippedSheet.getByRole("button", { name: "Зняти" }).click();
  await expect(equippedSheet).toBeHidden();
  await expect(page.getByRole("button", { name: "Оберіг другого подиху: порожньо" })).toBeVisible();
});

test("shop explains insufficient funds and forge waits for materials", async ({ page, request }) => {
  await finishTutorial(request, "player_locked");
  await signInAsDevPlayer(page, "player_locked");
  await page.getByRole("button", { name: /^Магазин/ }).click();
  await expect(page.getByRole("heading", { name: "МАГАЗИН" })).toBeVisible();
  await page.getByRole("button", { name: /Магічні карти/ }).click();
  const expensiveOffer = page.getByRole("button", { name: "Купити за 150 золота" });
  await expect(expensiveOffer).toBeVisible();
  await expensiveOffer.click();
  const fundsDialog = page.locator(".shop-insufficient-modal");
  await expect(fundsDialog).toBeVisible();
  await expect(fundsDialog).toContainText("Недостатньо ресурсів");
  await expect(fundsDialog).toContainText(/Потрібно ще \d+\s+золота/);
  await fundsDialog.getByRole("button", { name: "ОК" }).click();
  await expect(fundsDialog).toBeHidden();

  await page.getByRole("button", { name: "До категорій" }).click();
  await page.getByRole("navigation", { name: "Головна навігація" }).getByRole("button", { name: "Головна" }).click();
  await page.getByRole("button", { name: /^Спорядження/ }).click();
  await page.getByRole("button", { name: "До кузні" }).click();
  await expect(page.getByRole("heading", { name: "КУЗНЯ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Кувати" })).toBeDisabled();
});

test("guild edits preserve drafts when requests fail", async ({ page }) => {
  await signInAsDevPlayer(page, "guild_leader");
  await page.getByRole("navigation", { name: "Головна навігація" }).getByRole("button", { name: "Гільдія" }).click();
  await expect(page.locator(".guild-screen")).toContainText("Оголошення");
  const editButton = page.getByRole("button", { name: "Змінити", exact: true });
  await expect(editButton).toBeVisible();
  await editButton.click();
  const draft = `QA-перевірка ${Date.now()}`;
  const announcement = page.locator(".guild-announcement-form textarea");
  await announcement.fill(draft);

  await page.route((url) => url.pathname.endsWith("/announcement"), async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable" } }) });
  });
  await page.locator(".guild-announcement-form").getByRole("button", { name: "Зберегти" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(announcement).toHaveValue(draft);
  await expect(announcement).toHaveAttribute("maxlength", "280");
  await page.unrouteAll();

  await page.getByRole("button", { name: "Скасувати", exact: true }).click();
  const guildCard = page.getByRole("button", { name: /^Карта гільдії:/ });
  await guildCard.click();
  const cardScreen = page.locator(".guild-card-screen");
  await cardScreen.getByRole("button", { name: /^(Змінити карту гільдії|Обрати карту)$/ }).click();
  const candidate = page.locator(".guild-card-screen__selection-grid button").first();
  await candidate.waitFor();
  await candidate.click();
  const cardConfirmation = page.locator(".guild-card-screen__selection-confirmation");
  await expect(cardConfirmation).toContainText("Виставити");

  await page.route((url) => url.pathname.endsWith("/guild-card"), async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { code: "guild_permission_denied" } }) });
  });
  await cardConfirmation.getByRole("button", { name: "Підтвердити" }).click();
  await expect(page.getByRole("alert")).toContainText("У вас немає права");
  await expect(cardConfirmation).toContainText("Виставити");
  await page.unrouteAll();
  await cardConfirmation.getByRole("button", { name: "Скасувати" }).click();
  await cardScreen.getByRole("button", { name: "До гільдії" }).click();

  await page.getByRole("button", { name: /^Казна/ }).click();
  await expect(page.getByRole("heading", { name: "КАЗНА ГІЛЬДІЇ" })).toBeVisible();
  await expect(page.locator(".guild-treasury__cooldown")).toContainText("Внески відкриті");
  const silverInput = page.locator(".guild-treasury__donation-row input[type='number']").first();
  await silverInput.fill("1");
  await page.route((url) => url.pathname.endsWith("/treasury/donate"), async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: { code: "treasury_insufficient_silver" } }) });
  });
  await page.locator(".guild-treasury__donation-row").first().getByRole("button", { name: "Внести" }).click();
  await expect(page.getByRole("alert")).toContainText("Недостатньо срібла");
  await expect(silverInput).toHaveValue("1");
  await page.unrouteAll();
});
