import { expect, test, type Page } from "@playwright/test";

async function closeDailyRewardIfOpen(page: Page, settleMs = 700) {
  const dialog = page.locator(".daily-login-modal__dialog");
  await page.waitForTimeout(settleMs);
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.locator(".daily-login-modal__close").click();
    await expect(page.locator(".daily-login-modal")).toBeHidden();
  }
}

async function signInAsGuildLeader(page: Page) {
  await page.addInitScript(() => localStorage.setItem("cardastika.locale.v1", "uk"));
  await page.goto("/");
  await page.getByLabel("Тестовий локальний акаунт").selectOption("guild_leader");
  await expect(page.locator(".bottom-navigation")).toBeVisible();
  await closeDailyRewardIfOpen(page);
}

async function openDragonLairs(page: Page) {
  await page.getByRole("navigation", { name: "Головна навігація" }).getByRole("button", { name: "Гільдія" }).click();
  await page.getByRole("button", { name: /Рейди гільдії/ }).click();
  await expect(page.locator("#guild-raids-title")).toHaveText("Рейди гільдії");
  await page.locator(".guild-altar-upgrade").filter({ hasText: "Рейди на зміїв" }).getByRole("button", { name: "Відкрити" }).click();
  await expect(page.locator("#guild-dragon-title")).toHaveText("Рейди на зміїв");
}

test("guild raids: two raid kinds, eight lairs, sign-up, the reminder on other screens and back", async ({ page }) => {
  test.setTimeout(90_000);
  await signInAsGuildLeader(page);
  await openDragonLairs(page);

  // Eight lairs, each a card with its own sign-up button (reference layout).
  const lairs = page.locator(".guild-altar-upgrade");
  await expect(lairs).toHaveCount(8);
  await expect(page.getByRole("button", { name: "Рейтинг змієборців" })).toBeVisible();

  // Sign up from the list, then the lobby opens with its own chat.
  const firstLair = lairs.first();
  const lairName = (await firstLair.locator("h4").textContent())?.trim() ?? "";
  const signUp = firstLair.getByRole("button", { name: /Записатися на рейд|До рейду/ });
  await signUp.click();
  await expect(page.locator("#guild-dragon-title")).toContainText(lairName);
  await expect(page.locator(".guild-raid-lobby")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Чат лігва" })).toBeVisible();

  // The reminder shows on other screens and leads back to the raids page.
  await page.getByRole("navigation", { name: "Головна навігація" }).getByRole("button", { name: "Головна" }).click();
  const reminder = page.locator(".raid-status-banner");
  await expect(reminder).toContainText(lairName);
  await reminder.getByRole("button").click();
  await expect(page.locator("#guild-raids-title")).toHaveText("Рейди гільдії");
  await expect(page.locator(".raid-status-banner")).toHaveCount(0);

  // Leave the sign-up so the test can run again.
  await page.locator(".guild-altar-upgrade").filter({ hasText: "Рейди на зміїв" }).getByRole("button", { name: "Відкрити" }).click();
  await page.locator(".guild-altar-upgrade").filter({ hasText: lairName }).getByRole("button", { name: "До рейду" }).click();
  await page.getByRole("button", { name: "Вийти із запису" }).click();
  await expect(page.getByRole("button", { name: "Записатися в рейд" })).toBeVisible();
});

test("witch raids show both sorceresses as shaded art and the raid chat", async ({ page }) => {
  test.setTimeout(60_000);
  await signInAsGuildLeader(page);
  await page.getByRole("navigation", { name: "Головна навігація" }).getByRole("button", { name: "Гільдія" }).click();
  await page.getByRole("button", { name: /Рейди гільдії/ }).click();
  await page.locator(".guild-altar-upgrade").filter({ hasText: "Битви з відьмами" }).getByRole("button", { name: "Відкрити" }).click();
  const bosses = page.locator(".guild-raid-lobby .guild-raid__boss");
  const locked = page.getByText(/Рейди на відьом відкриваються з 34 рівня гільдії/);
  if (await locked.isVisible().catch(() => false)) {
    test.skip(true, "The local guild is below level 34");
  }
  await expect(bosses).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Чат рейду" })).toBeVisible();
});
