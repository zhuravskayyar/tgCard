import { access, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

export const ONBOARDING_CALLBACK = "onboarding:intro";

export interface OnboardingSlide {
  fileName: string;
  caption: string;
}

export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = Object.freeze([
  {
    fileName: "01-main.jpg",
    caption: "Твоя пригода починається тут\n\nРозвивай героя, збирай ресурси та обирай, куди вирушити далі.",
  },
  {
    fileName: "02-cards.jpg",
    caption: "Збирай свою колоду\n\nКарти чотирьох стихій мають різну рідкість та силу. Знаходь сильні карти й покращуй їх.",
  },
  {
    fileName: "03-battle.jpg",
    caption: "Випробуй колоду в бою\n\nБийся з іншими гравцями, використовуй переваги стихій та піднімайся в рейтингу.",
  },
  {
    fileName: "04-guild.jpg",
    caption: "Грай разом\n\nВступай у гільдію, отримуй її бонуси та відкривай додаткові можливості.",
  },
  {
    fileName: "05-profile.jpg",
    caption: "Розвивай свого героя\n\nСпорядження, карти та рівень поступово посилюють твій акаунт.",
  },
]);

export const ONBOARDING_WELCOME = [
  "Cardastika",
  "",
  "Колекційна fantasy-гра прямо в Telegram.",
  "",
  "Збирай карти чотирьох стихій, посилюй свою колоду, бийся з іншими гравцями та відкривай нові можливості свого героя.",
  "",
  "Без довгих пояснень — зібрав колоду і в бій.",
].join("\n");

export const ONBOARDING_RETURNING = [
  "З поверненням у Cardastika.",
  "",
  "Твоя колода вже чекає на наступний бій.",
].join("\n");

export const ONBOARDING_FALLBACK = [
  "Cardastika — це колекційна fantasy-гра про карти чотирьох стихій.",
  "",
  "Збирай колекцію, складай колоду, розвивай героя, бийся та грай разом із гільдією.",
].join("\n");

export const ONBOARDING_FINAL = [
  "Готовий увійти у Cardastika?",
  "",
  "Твоя перша колода вже чекає.",
].join("\n");

function projectDirectory() {
  const workingDirectory = resolve(process.cwd());
  return basename(workingDirectory).toLowerCase() === "server"
    ? dirname(workingDirectory)
    : workingDirectory;
}

export function getOnboardingAssetDirectory() {
  return process.env.CARDASTIKA_ONBOARDING_ASSETS_DIR?.trim()
    || resolve(projectDirectory(), "bot", "assets", "onboarding");
}

export async function findAvailableOnboardingSlides(assetDirectory = getOnboardingAssetDirectory()) {
  const available: Array<OnboardingSlide & { path: string }> = [];

  for (const slide of ONBOARDING_SLIDES) {
    const path = resolve(assetDirectory, slide.fileName);
    try {
      await access(path);
      if ((await stat(path)).isFile()) available.push({ ...slide, path });
    } catch {
      // Missing assets are intentional during initial setup. No fake images are sent.
    }
  }

  return available;
}

export function isStartCommand(text: string | undefined) {
  const command = text?.trim().split(/\s+/u)[0];
  return typeof command === "string" && /^\/start(?:@[a-z0-9_]+)?$/iu.test(command);
}
