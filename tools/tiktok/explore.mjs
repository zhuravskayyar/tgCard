import { chromium } from "playwright";
const [out, name, ...steps] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const res = await (await fetch("http://127.0.0.1:5173/api/dev/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountKey: process.env.ACC || "guild_leader" }) })).json();
await page.addInitScript((t) => { localStorage.setItem("cardastika.session.token", t); localStorage.setItem("cardastika.locale.v1", "uk"); }, res.sessionToken);
await page.goto("http://127.0.0.1:5173/");
await page.waitForTimeout(3000);
let i = 0;
for (const s of steps) {
  if (s.startsWith("wait:")) { await page.waitForTimeout(+s.slice(5)); continue; }
  if (s === "shot") { await page.screenshot({ path: `${out}/${name}-${++i}.png` }); continue; }
  await page.getByRole("button", { name: s, exact: false }).first().click({ timeout: 5000 }).catch(async () => { await page.getByText(s, { exact: false }).first().click({ timeout: 5000 }); });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/${name}-${++i}.png` });
}
const items = await page.$$eval("button, a, [role=button]", (els) => els.map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)).filter(Boolean));
console.log(JSON.stringify(items));
await browser.close();
