import { expect, test, type Page } from "@playwright/test";

async function closeDailyRewardIfOpen(page: Page, settleMs = 700) {
  const dialog = page.locator(".daily-login-modal__dialog");
  await page.waitForTimeout(settleMs);
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.locator(".daily-login-modal__close").click();
    await expect(page.locator(".daily-login-modal")).toBeHidden();
  }
}

async function signInAsDevPlayer(page: Page, accountKey: string) {
  await page.goto("/");
  await page.getByLabel("Тестовий локальний акаунт").selectOption(accountKey);
  await expect(page.locator(".bottom-navigation")).toBeVisible();
  await closeDailyRewardIfOpen(page);
  await expect(page.getByRole("navigation", { name: "Головна навігація" }).getByRole("button")).toHaveCount(3);
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
    { path: "/collections", selector: ".collections-screen" },
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
        await page.getByRole("button", { name: "Ліга", exact: true }).click();
        await expect(page.locator(".arena-screen")).toContainText("Рейтинг");
        await expectNoHorizontalOverflow(page);
        await page.getByRole("button", { name: "Магазин", exact: true }).click();
        await expect(page.locator(".arena-screen")).toContainText(/жетони/i);
        await expectNoHorizontalOverflow(page);
        await page.getByRole("button", { name: "Бій", exact: true }).click();
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
  const candidates = page.locator(".absorption-grid button");
  await expect(candidates.first()).toBeVisible();

  await candidates.first().click();
  const absorptionDialog = page.getByRole("dialog", { name: "Підтвердити поглинання?" });
  await expect(absorptionDialog).toBeVisible();
  await expect(absorptionDialog.getByRole("button", { name: "Скасувати" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(absorptionDialog).toBeHidden();

  await candidates.first().click();
  let absorptionRequests = 0;
  await page.route((url) => url.pathname.startsWith("/api/player/cards/") && url.pathname.endsWith("/absorb"), async (route) => {
    absorptionRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "protected_card" } }),
    });
  });
  const absorbButton = absorptionDialog.getByRole("button", { name: "Поглинути карту" });
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

  const levelUp = page.locator(".level-up-button");
  if (await levelUp.isEnabled()) {
    await levelUp.click();
    const levelDialog = page.getByRole("dialog", { name: "Підняти рівень?" });
    await expect(levelDialog).toBeVisible();
    await expect(levelDialog).toContainText("золота");
    await levelDialog.getByRole("button", { name: "Скасувати" }).click();
    await expect(levelDialog).toBeHidden();
  }

  const protection = page.locator(".card-protection-toggle");
  const initialProtection = await protection.getAttribute("aria-pressed");
  await protection.click();
  await expect(protection).toHaveAttribute("aria-pressed", initialProtection === "true" ? "false" : "true");
  const successFeedback = page.locator(".action-feedback--success");
  const firstProtectionMessage = initialProtection === "true" ? "Захист карти вимкнено." : "Захист карти увімкнено.";
  const secondProtectionMessage = initialProtection === "true" ? "Захист карти увімкнено." : "Захист карти вимкнено.";
  await expect(successFeedback).toContainText(firstProtectionMessage);
  expect(await successFeedback.evaluate((element) => getComputedStyle(element).animationName)).toBe("action-feedback-success");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await protection.click();
  await expect(protection).toHaveAttribute("aria-pressed", initialProtection ?? "false");
  await expect(successFeedback).toContainText(secondProtectionMessage);
  expect(await successFeedback.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  expect(runtimeErrors).toEqual([]);
});

test("equipment saves on the server, survives reload, and can be restored", async ({ page }) => {
  await signInAsDevPlayer(page, "guild_leader");
  await page.getByRole("button", { name: "Спорядження", exact: true }).click();
  await expect(page.getByRole("heading", { name: "СПОРЯДЖЕННЯ" })).toBeVisible();
  await page.getByRole("tab", { name: /Артефакти/ }).click();
  const item = page.locator(".equipment-item-card").first();
  await item.waitFor();
  const amuletSlot = page.getByRole("button", { name: "Амулет життя: Порожній слот" });
  if (await amuletSlot.count() === 0) {
    await item.click();
    const existingSheet = page.locator(".equipment-item-sheet");
    if (await existingSheet.getByRole("button", { name: "Зняти" }).count()) {
      await existingSheet.getByRole("button", { name: "Зняти" }).click();
      await existingSheet.waitFor({ state: "hidden" });
    }
  }
  await item.click();
  const sheet = page.locator(".equipment-item-sheet");
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
  await expect(page.getByRole("button", { name: "Амулет життя: Амулет життя · Міфічна" })).toBeVisible();

  await page.reload();
  await closeDailyRewardIfOpen(page, 1_000);
  await expect(page.getByRole("heading", { name: "СПОРЯДЖЕННЯ" })).toBeVisible();
  await expect(page.locator(".equipment-summary")).toBeVisible();
  await page.getByRole("tab", { name: /Артефакти/ }).click();
  await page.locator(".equipment-item-card").first().click();
  const equippedSheet = page.locator(".equipment-item-sheet");
  await expect(equippedSheet).toContainText("Одягнено");
  await equippedSheet.getByRole("button", { name: "Зняти" }).click();
  await expect(equippedSheet).toBeHidden();
  await expect(page.locator(".equipment-empty-summary")).toBeVisible();
});

test("shop explains insufficient funds and forge keeps unavailable crafting disabled", async ({ page }) => {
  await signInAsDevPlayer(page, "player_locked");
  await page.getByRole("button", { name: "Магазин", exact: true }).click();
  await expect(page.getByRole("heading", { name: "МАГАЗИН" })).toBeVisible();
  await page.getByRole("button", { name: /Магічні карти/ }).click();
  const expensiveOffer = page.getByRole("button", { name: "Купити за 150 золота" });
  await expect(expensiveOffer).toBeVisible();
  await expensiveOffer.click();
  const fundsDialog = page.locator(".shop-insufficient-modal");
  await expect(fundsDialog).toBeVisible();
  await expect(fundsDialog).toContainText("Недостатньо ресурсів");
  await expect(fundsDialog).toContainText("148");
  await fundsDialog.getByRole("button", { name: "ОК" }).click();
  await expect(fundsDialog).toBeHidden();

  await page.getByRole("button", { name: "До категорій" }).click();
  await page.getByRole("navigation", { name: "Головна навігація" }).getByRole("button", { name: "Головна" }).click();
  await page.getByRole("button", { name: "Спорядження", exact: true }).click();
  await page.getByRole("button", { name: /Кузня/ }).click();
  await expect(page.getByRole("heading", { name: "КУЗНЯ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Кування поки недоступне" })).toBeDisabled();
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
  const cardSheet = page.locator(".guild-card-sheet");
  await cardSheet.getByRole("button", { name: "Змінити карту" }).click();
  const candidate = page.locator(".guild-card-selection button").first();
  await candidate.waitFor();
  await candidate.click();
  const cardConfirmation = page.locator(".guild-card-confirmation");
  await expect(cardConfirmation).toContainText("Встановити");

  await page.route((url) => url.pathname.endsWith("/guild-card"), async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { code: "guild_permission_denied" } }) });
  });
  await cardConfirmation.getByRole("button", { name: "Підтвердити" }).click();
  await expect(page.getByRole("alert")).toContainText("У вас немає права");
  await expect(cardConfirmation).toContainText("Встановити");
  await page.unrouteAll();
  await cardConfirmation.getByRole("button", { name: "Скасувати" }).click();
  await cardSheet.getByRole("button", { name: "Закрити" }).click();

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
