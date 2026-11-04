// Renders the transparent 1080x1920 caption overlays for every locale from captions.json.
// Usage: node tools/tiktok/overlays.mjs <outRoot>
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const outRoot = process.argv[2] ?? "tiktok-out";
const captions = JSON.parse(readFileSync(new URL("./captions.json", import.meta.url), "utf8"));
const BASE = "http://127.0.0.1:5173";

const style = `
  @font-face { font-family: "Lugatype"; src: url("/fonts/lugatype.otf") format("opentype"); }
  html, body { margin: 0; width: 1080px; height: 1920px; background: transparent; overflow: hidden; }
  .caption { position: absolute; left: 40px; width: 1000px; height: 313px; top: var(--top);
    background: url("/assets/ui/auth/parchment/title-plaque-v1.webp") center / 100% 100% no-repeat;
    display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 14px 22px rgba(30, 16, 4, .55)); }
  .caption span { max-width: 760px; text-align: center; font: 400 64px/1.08 "Lugatype", Georgia, serif; color: #2b1a0c;
    text-shadow: 0 1px 0 rgba(255, 240, 210, .6); }
  .cta { position: absolute; left: 60px; top: 1080px; width: 960px; height: 700px;
    background: url("/assets/ui/auth/parchment/panel-v1.webp") center / 100% 100% no-repeat;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px;
    filter: drop-shadow(0 18px 30px rgba(30, 16, 4, .6)); font-family: "Lugatype", Georgia, serif; color: #2b1a0c; }
  .cta .lead { font-size: 70px; }
  .cta .url { font-size: 84px; color: #fff4dc; background: linear-gradient(#8e1f1c, #5e1210); padding: 18px 44px; border-radius: 22px;
    box-shadow: inset 0 0 0 4px rgba(255, 214, 150, .55), 0 8px 16px rgba(0, 0, 0, .35); letter-spacing: 1px; }
  .cta .sub { font-size: 50px; opacity: .9; }
`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(`${BASE}/card-art/card-art-map.txt`);

async function render(html, file) {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${style}</style>${html}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  await page.waitForTimeout(150);
  await page.screenshot({ path: file, omitBackground: true });
}

const escape = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
for (const [locale, text] of Object.entries(captions)) {
  const dir = join(outRoot, locale);
  mkdirSync(dir, { recursive: true });
  for (const key of ["hook", "collections", "deck", "duel", "arena", "guild", "pack"]) {
    await render(`<div class="caption" style="--top: 205px"><span>${escape(text[key])}</span></div>`, join(dir, `cap-${key}.png`));
  }
  await render(`<div class="cta"><div class="lead">${escape(text.cta)}</div><div class="url">app.cardastika.org</div><div class="sub">${escape(text.telegram)}</div></div>`, join(dir, "cap-cta.png"));
  console.log(`${locale}: overlays ready`);
}
await browser.close();
