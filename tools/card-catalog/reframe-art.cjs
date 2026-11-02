// Usage: node reframe-art.cjs [id ...] [--write]; REFRAME_OUT=<folder> keeps the reframed full-size PNGs.
// Plans (and with --write applies) centring and enlarging of served card arts from their ~/Downloads originals:
// visual centre (between bbox and mass centre) to 50%, size up to 86% without shrinking, medallion corner kept clear.
const fs = require("fs"), path = require("path");
const sharp = require("sharp");
// Windows keeps files sharp has read open while cached, which blocks rewriting them.
sharp.cache(false);
const repo = path.resolve(__dirname, "../.."), write = process.argv.includes("--write");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dir = repo + "/client/public/card-art/", dl = path.join(process.env.USERPROFILE, "Downloads");
const out = process.env.REFRAME_OUT || require("os").tmpdir();
const ids = fs.readFileSync(dir + "card-art-map.txt", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#")).map((l) => l.split("|")[0].trim());
const TARGET = 0.86, MIN = 0.06, MAX = 0.94, CORNER_MAX = 2.5;

// Windows briefly locks served files (dev server watcher), so write through a temp file and retry.
async function writeWithRetry(file, data) {
  for (let attempt = 1; ; attempt++) {
    try { fs.writeFileSync(file + ".tmp", data); fs.renameSync(file + ".tmp", file); return; }
    catch (error) { if (attempt >= 8) throw error; await new Promise((r) => setTimeout(r, 250 * attempt)); }
  }
}
async function mask(input, S) {
  const d = await sharp(input).resize(S, S).ensureAlpha().raw().toBuffer();
  const m = new Uint8Array(S * S); for (let i = 0; i < S * S; i++) m[i] = d[i * 4 + 3] >= 10 ? 1 : 0; return m;
}
function stats(m, S) {
  let x0 = S, x1 = 0, y0 = S, y1 = 0, n = 0, sx = 0, corner = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (m[y * S + x]) { n++; sx += x; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); if (x > S * .75 && y > S * .75) corner++; }
  return { x0: x0 / S, x1: (x1 + 1) / S, y0: y0 / S, y1: (y1 + 1) / S, mx: sx / n / S, corner: corner / (S * S / 16) * 100 };
}
// Corner fill of the original mask after scaling by k around the bbox and placing its bbox at (left, top).
function cornerAfter(m, S, st, k, left, top) {
  let c = 0; const N = 128;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x + .5) / N, fy = (y + .5) / N; if (fx <= .75 || fy <= .75) continue;
    const ox = st.x0 + (fx - left) / k, oy = st.y0 + (fy - top) / k;
    if (ox < 0 || oy < 0 || ox >= 1 || oy >= 1) continue;
    if (m[Math.floor(oy * S) * S + Math.floor(ox * S)]) c++;
  }
  return c / (N * N / 16) * 100;
}
(async () => {
  const rows = [];
  for (const id of ids) {
    if (only.length && !only.includes(id)) continue;
    const src = [id + "_original.png", id + ".png"].map((f) => path.join(dl, f)).find(fs.existsSync);
    const S = 256;
    const cur = await mask(fs.readFileSync(dir + id + ".webp"), S);
    const m = await mask(src, S);
    const st = stats(m, S), cs = stats(cur, S);
    // The served art may already be a rescaled copy; compare shapes after normalising both bboxes.
    const norm = async (mm, s) => { const c = new Uint8Array(64 * 64); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const ox = Math.floor((s.x0 + (x + .5) / 64 * (s.x1 - s.x0)) * S), oy = Math.floor((s.y0 + (y + .5) / 64 * (s.y1 - s.y0)) * S); c[y * 64 + x] = mm[oy * S + ox]; } return c; };
    const a = await norm(m, st), b = await norm(cur, cs); let inter = 0, uni = 0; for (let i = 0; i < a.length; i++) { inter += a[i] & b[i]; uni += a[i] | b[i]; }
    const iou = inter / uni;
    const w = st.x1 - st.x0, h = st.y1 - st.y0;
    // Visual centre: halfway between bbox centre and mass centre.
    const vx = ((st.x0 + st.x1) / 2 + st.mx) / 2 - st.x0; // offset of the visual centre inside the bbox, in source units
    // Never shrink: start from the larger of the target and the current size, step down to the current size,
    // and when the medallion corner gets crowded move only part of the way toward the centre.
    const sizeCur = Math.max(cs.x1 - cs.x0, cs.y1 - cs.y0);
    const kMin = sizeCur / Math.max(w, h), kMax = Math.max(Math.min(Math.max(TARGET, sizeCur), 0.92) / Math.max(w, h), kMin);
    let plan;
    for (let k = kMax; k >= kMin * 0.999 && !plan; k = k > kMin ? Math.max(k * 0.97, kMin) : 0) {
      const curLeft = 0.5 - (0.5 - cs.x0) * k / kMin, curTop = 0.5 - (0.5 - cs.y0) * k / kMin; // current placement scaled about the centre
      for (let t = 1; t >= -0.001; t -= 0.1) {
        let left = curLeft + (0.5 - vx * k - curLeft) * t, top = curTop + (0.5 - (h * k) / 2 - curTop) * t;
        left = Math.min(Math.max(left, MIN), MAX - w * k); top = Math.min(Math.max(top, MIN), MAX - h * k);
        const corner = cornerAfter(m, S, st, k, left, top);
        if (corner <= Math.max(CORNER_MAX, cs.corner)) { plan = { k, left, top, corner }; break; }
      }
      if (k === kMin) break;
    }
    if (!plan) { rows.push({ id, note: "no fit" }); continue; }
    const cxNow = (cs.x0 + cs.x1) / 2 * 100, cxNew = (plan.left + w * plan.k / 2) * 100;
    const sizeNow = Math.max(cs.x1 - cs.x0, cs.y1 - cs.y0), sizeNew = Math.max(w, h) * plan.k;
    const vNow = (((cs.x0 + cs.x1) / 2 + cs.mx) / 2) * 100, vNew = (plan.left + vx * plan.k) * 100;
    const change = Math.abs(vNew - vNow) >= 3 || sizeNew / sizeNow >= 1.06;
    rows.push({ id, iou: +iou.toFixed(2), src: path.basename(src), visCx: `${vNow.toFixed(0)}→${vNew.toFixed(0)}`, size: `${(sizeNow * 100).toFixed(0)}→${(sizeNew * 100).toFixed(0)}`, corner: `${cs.corner.toFixed(1)}→${plan.corner.toFixed(1)}`, change });
    if (write && change && iou >= 0.8) {
      const meta = await sharp(src).metadata(); const W = meta.width;
      const ex = { left: Math.round(st.x0 * W), top: Math.round(st.y0 * W), width: Math.round(w * W), height: Math.round(h * W) };
      const nw = Math.round(ex.width * plan.k), nh = Math.round(ex.height * plan.k);
      const piece = await sharp(src).extract(ex).resize(nw, nh, { kernel: "lanczos3" }).toBuffer();
      const png = await sharp({ create: { width: W, height: W, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: piece, left: Math.round(plan.left * W), top: Math.round(plan.top * W) }]).png().toBuffer();
      fs.writeFileSync(path.join(out, id + ".png"), png);
      const webp = await sharp(png).resize(512, 512, { kernel: "lanczos3" }).webp({ quality: 88, alphaQuality: 95, effort: 6 }).toBuffer();
      await writeWithRetry(dir + id + ".webp", webp);
    }
  }
  console.table(rows);
})();
