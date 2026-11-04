// Records the TikTok gameplay clips from the local game for one UI locale.
// Usage: npx tsx tools/tiktok/record.mts <uk|en|ru|de> <outDir> [clip,...]
import { chromium, type Page } from "playwright";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CORE_TRANSLATIONS } from "../../client/src/locales/coreTranslations.ts";
import { SCREEN_TRANSLATIONS } from "../../client/src/locales/screenTranslations.ts";

const [locale = "uk", outDir = "tiktok-out", only] = process.argv.slice(2);
const BASE = "http://127.0.0.1:5173";
const column = { uk: 0, en: 1, de: 2, ru: 3 }[locale as "uk"] ?? 0;
const dictionary = new Map([...CORE_TRANSLATIONS, ...SCREEN_TRANSLATIONS].map((row) => [row[0], row[column]]));
const t = (uk: string) => (column === 0 ? uk : dictionary.get(uk) ?? uk);
const wanted = new Set(only ? only.split(",") : ["arena", "deck", "collections", "guild", "duel", "pack", "outro"]);
mkdirSync(outDir, { recursive: true });

const login = async () => {
  const response = await fetch(`${BASE}/api/dev/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountKey: "player_regular" }) });
  return ((await response.json()) as { sessionToken: string }).sessionToken;
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5 });
const token = await login();
await context.addInitScript(([session, lang]) => {
  if (session) localStorage.setItem("cardastika.session.token", session);
  else localStorage.removeItem("cardastika.session.token");
  localStorage.setItem("cardastika.locale.v1", lang);
}, [token, locale] as const);
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

type Mark = { at: number; kind: string };
/** Captures every painted frame while `body` runs, then encodes them as a 30 fps clip with its event marks. */
async function clip(name: string, body: (mark: (kind: string) => void) => Promise<void>) {
  const frameDir = join(outDir, `${name}-frames`);
  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });
  const frames: Array<{ file: string; ts: number }> = [];
  const marks: Mark[] = [];
  const onFrame = async (event: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
    const file = `f${String(frames.length).padStart(5, "0")}.jpg`;
    writeFileSync(join(frameDir, file), Buffer.from(event.data, "base64"));
    frames.push({ file, ts: event.metadata.timestamp ?? Date.now() / 1000 });
    await cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {});
  };
  cdp.on("Page.screencastFrame", onFrame);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  const start = Date.now() / 1000;
  await body((kind) => marks.push({ at: Date.now() / 1000 - start, kind }));
  await page.waitForTimeout(400);
  await cdp.send("Page.stopScreencast");
  cdp.off("Page.screencastFrame", onFrame);
  const end = Date.now() / 1000;
  // Screencast timestamps share the wall clock, so each frame lasts until the next one was painted.
  const lines = ["ffconcat version 1.0"];
  frames.forEach((frame, index) => {
    const next = frames[index + 1]?.ts ?? end;
    lines.push(`file '${frame.file}'`, `duration ${Math.max(0.001, next - frame.ts).toFixed(4)}`);
  });
  lines.push(`file '${frames.at(-1)!.file}'`);
  writeFileSync(join(frameDir, "list.txt"), lines.join("\n"));
  const offset = Math.max(0, frames[0]!.ts - start);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(frameDir, "list.txt"),
    "-vf", "scale=1080:1920:flags=lanczos,fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "medium", join(outDir, `${name}.mp4`)]);
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify({ offset, marks }, null, 1));
  rmSync(frameDir, { recursive: true, force: true });
  console.log(`${locale}/${name}: ${frames.length} frames, ${(end - start).toFixed(1)}s, marks ${marks.length}`);
}

async function home() {
  await page.goto(BASE);
  await page.locator(".bottom-nav, nav").first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(2500);
  await dismissOverlays();
}

async function dismissOverlays() {
  for (let i = 0; i < 3; i++) {
    const hint = page.locator(".first-visit-hint button, [role=dialog] button[aria-label*='акрити'], [role=dialog] button:has-text('" + t("Закрити") + "')").first();
    if (!(await hint.isVisible().catch(() => false))) return;
    await hint.click().catch(() => {});
    await page.waitForTimeout(500);
  }
}

const tap = async (uk: string) => {
  await page.getByText(t(uk), { exact: true }).first().click();
};

async function smoothScroll(distance: number, ms: number) {
  const steps = Math.round(ms / 33);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, distance / steps);
    await page.waitForTimeout(33);
  }
}

const attackButton = () => page.locator("button.duel-card--player:not([disabled])").first();

async function attack(mark: (kind: string) => void, times: number) {
  for (let done = 0, tries = 0; done < times && tries < times * 6; tries++) {
    const button = attackButton();
    if (!(await button.isVisible().catch(() => false))) {
      if (!(await page.locator("button.duel-card--player").count())) return;
      await page.waitForTimeout(250);
      continue;
    }
    mark("attack");
    await button.click().catch(() => {});
    done++;
    await page.waitForTimeout(1900);
  }
}

await page.mouse.move(216, 600);

if (wanted.has("arena")) {
  await home();
  await page.goto(BASE);
  await page.waitForTimeout(2500);
  await dismissOverlays();
  // An unfinished arena match resumes directly; otherwise queue and wait out the 15 s lobby off camera.
  await tap("Арена");
  await page.waitForTimeout(1500);
  await page.locator(".first-visit-hint button").first().click({ timeout: 1500 }).catch(() => {});
  const queue = page.getByText(t("Записатися на арену"), { exact: true });
  if (await queue.isVisible().catch(() => false)) await queue.click();
  await attackButton().waitFor({ timeout: 40000 });
  await page.waitForTimeout(2500);
  await clip("arena", (mark) => attack(mark, 9));
  // Let the rest of the match finish quietly so the next run starts clean.
  await attack(() => {}, 30);
}

if (wanted.has("deck")) {
  await home();
  await clip("deck", async (mark) => {
    await page.waitForTimeout(300);
    mark("tap");
    await tap("Колода");
    await page.waitForTimeout(3600);
  });
}

if (wanted.has("collections")) {
  await home();
  await clip("collections", async (mark) => {
    await page.waitForTimeout(300);
    mark("tap");
    await tap("Колекції");
    await page.waitForTimeout(1300);
    await smoothScroll(1400, 2600);
    await page.waitForTimeout(300);
  });
}

if (wanted.has("guild")) {
  await home();
  await clip("guild", async (mark) => {
    await page.waitForTimeout(300);
    mark("tap");
    await tap("Гільдія");
    await page.waitForTimeout(1500);
    await smoothScroll(700, 1800);
    await page.waitForTimeout(300);
  });
}

if (wanted.has("duel")) {
  // Matchmaking can pair a stronger opponent; keep fighting until a duel ends in victory.
  for (let attempt = 0; attempt < 6; attempt++) {
    await home();
    await tap("Дуель");
    const start = page.getByText(t("НАПАСТИ"), { exact: true });
    await Promise.race([start.waitFor({ timeout: 20000 }), attackButton().waitFor({ timeout: 20000 })]).catch(() => {});
    if (await start.isVisible().catch(() => false)) await start.click();
    await attackButton().waitFor({ timeout: 20000 });
    let won = false;
    await clip("duel", async (mark) => {
      await attack(mark, 40);
      mark("victory");
      await page.waitForTimeout(3200);
      won = await page.getByText(t("ПЕРЕМОГА"), { exact: true }).first().isVisible().catch(() => false);
    });
    if (won) break;
    console.log(`${locale}/duel: attempt ${attempt + 1} lost, retrying`);
  }
}

if (wanted.has("pack")) {
  for (let attempt = 0; attempt < 12; attempt++) {
    await home();
    await page.locator(".menu-row", { hasText: t("Магазин") }).first().click();
    await page.waitForTimeout(1200);
    await tap("Магічні карти");
    await page.waitForTimeout(1500);
    // Offers differ in what they can drop; rotate them until a painted card is revealed.
    const price = ["150", "500", "50"][attempt % 3]!;
    const buy = page.locator("button").filter({ hasText: new RegExp(`(^|\\D)${price}(\\D|$)`) }).first();
    let painted = false;
    await clip("pack", async (mark) => {
      await page.waitForTimeout(300);
      mark("buy");
      await buy.click();
      await page.locator(".shop-unbox").waitFor({ timeout: 10000 });
      await page.waitForTimeout(900);
      mark("open");
      await page.locator(".shop-unbox").click();
      await page.waitForTimeout(1200);
      mark("reveal");
      await page.waitForTimeout(2600);
      // Art is composited by the card renderer, so judge by ink: painted art has dark lines, an empty frame stays bright gold.
      const probe = join(outDir, "pack-probe.png");
      await page.screenshot({ path: probe, scale: "css", clip: { x: 150, y: 265, width: 130, height: 150 } });
      const stats = spawnSync("ffmpeg", ["-hide_banner", "-i", probe, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YLOW", "-f", "null", "-"], { encoding: "utf8" });
      painted = Number(/YLOW=(\d+)/.exec(stats.stderr)?.[1] ?? 255) < 90;
    });
    if (painted) break;
    console.log(`${locale}/pack: attempt ${attempt + 1} (${price}) revealed an unpainted card, retrying`);
  }
}

if (wanted.has("outro")) {
  // A signed-out visitor sees the real start screen with the Cardastika logo.
  const outroContext = await browser.newContext({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5 });
  await outroContext.addInitScript((lang) => { localStorage.removeItem("cardastika.session.token"); localStorage.setItem("cardastika.locale.v1", lang); }, locale);
  // The local demo-account picker must not appear in a public video.
  await outroContext.route("**/api/dev/accounts", (route) => route.fulfill({ status: 404, body: "" }));
  const outroPage = await outroContext.newPage();
  await outroPage.goto(BASE);
  await outroPage.waitForTimeout(4000);
  await outroPage.screenshot({ path: join(outDir, "outro.png") });
  await outroContext.close();
  console.log(`${locale}/outro: screenshot`);
}

await browser.close();
