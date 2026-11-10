// Usage: node tools/arena-scene/prepare-scene.cjs [name ...]
// Reads ~/Downloads/<name>.png (2-sky, 3-arena, ... 9-mages) and writes served webp files
// to client/public/assets/ui/arena/scene/. Full-canvas layers keep their framing so they stay
// aligned; single elements are trimmed; sheets are split into one file per element.
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const OUT = process.env.ARENA_SCENE_OUT || path.join(__dirname, "../../client/public/assets/ui/arena/scene");
// max: longest side in px; keepTop: share of a canvas kept from the top (the rest hides behind the arena).
const SOURCES = {
  "2-sky": { kind: "canvas", width: 900, keepTop: 0.62 },
  "3-arena": { kind: "element", max: 900 },
  "4-runes": { kind: "element", max: 576 },
  "5-banner": { kind: "element", max: 256 },
  "6-torch": { kind: "element", max: 256 },
  "7-flame": { kind: "element", max: 256 },
  "8-sheet": { kind: "sheet", max: 420 },
  "9-mages": { kind: "sheet", max: 256 },
};
const WEBP = { quality: 82, alphaQuality: 90, effort: 6 };

/** Generators sometimes return a white background: clear near-white pixels connected to the border. */
function clearBorderWhite(data, width, height) {
  const isWhite = (i) => data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 235;
  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x += 1) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y += 1) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || !isWhite(p * 4)) continue;
    seen[p] = 1;
    data[p * 4 + 3] = 0;
    const x = p % width;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (p >= width) stack.push(p - width);
    if (p < width * (height - 1)) stack.push(p + width);
  }
}

async function loadRgba(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const meta = await sharp(file).metadata();
  const opaqueCorners = [0, info.width - 1, (info.height - 1) * info.width, info.height * info.width - 1]
    .every((p) => data[p * 4 + 3] === 255);
  if (!meta.hasAlpha || opaqueCorners) clearBorderWhite(data, info.width, info.height);
  return { data, width: info.width, height: info.height };
}

const toSharp = ({ data, width, height }) => sharp(data, { raw: { width, height, channels: 4 } });

/** Bounding boxes of separate opaque islands, found on a coarse grid so near pieces stay together. */
function findIslands({ data, width, height }, cell = 8) {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const filled = new Uint8Array(cols * rows);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 24) filled[Math.floor(y / cell) * cols + Math.floor(x / cell)] = 1;
    }
  }
  const seen = new Uint8Array(cols * rows);
  const boxes = [];
  for (let start = 0; start < filled.length; start += 1) {
    if (!filled[start] || seen[start]) continue;
    const box = { left: Infinity, top: Infinity, right: -1, bottom: -1, cells: 0 };
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const c = stack.pop();
      const cx = c % cols;
      const cy = Math.floor(c / cols);
      box.left = Math.min(box.left, cx); box.right = Math.max(box.right, cx);
      box.top = Math.min(box.top, cy); box.bottom = Math.max(box.bottom, cy);
      box.cells += 1;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = cx + dx;
          const ny = cy + dy;
          const n = ny * cols + nx;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[n] || !filled[n]) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (box.cells >= 4) boxes.push(box);
  }
  return boxes
    .map((b) => ({ left: b.left * cell, top: b.top * cell, width: Math.min(width, (b.right + 1) * cell) - b.left * cell, height: Math.min(height, (b.bottom + 1) * cell) - b.top * cell }))
    .sort((a, b) => Math.round(a.top / 200) - Math.round(b.top / 200) || a.left - b.left);
}

async function writeElement(image, target, max) {
  const info = await image
    .trim({ threshold: 1 })
    .resize(max, max, { fit: "inside", withoutEnlargement: true, kernel: "lanczos3" })
    .webp(WEBP)
    .toFile(target);
  return info;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SOURCES);
  for (const name of names) {
    const config = SOURCES[name];
    if (!config) { console.log(`skip ${name}: unknown name`); continue; }
    const source = path.join(process.env.USERPROFILE, "Downloads", `${name}.png`);
    if (!fs.existsSync(source)) { console.log(`skip ${name}: ${source} not found`); continue; }
    const rgba = await loadRgba(source);
    if (config.kind === "canvas") {
      const keptHeight = Math.round(rgba.height * (config.keepTop ?? 1));
      const kept = await toSharp(rgba).extract({ left: 0, top: 0, width: rgba.width, height: keptHeight }).png().toBuffer();
      const info = await sharp(kept).resize({ width: config.width, kernel: "lanczos3" }).webp(WEBP).toFile(path.join(OUT, `${name}.webp`));
      console.log(name, `${info.width}x${info.height}`, `${Math.round(info.size / 1024)} KB`);
    } else if (config.kind === "element") {
      const info = await writeElement(toSharp(rgba), path.join(OUT, `${name}.webp`), config.max);
      console.log(name, `${info.width}x${info.height}`, `${Math.round(info.size / 1024)} KB`);
    } else {
      const raw = await toSharp(rgba).png().toBuffer();
      const islands = findIslands(rgba);
      for (const [index, box] of islands.entries()) {
        // sharp trims before extracting within one pipeline, so cut the piece out first.
        const piece = await sharp(raw).extract(box).png().toBuffer();
        const info = await writeElement(sharp(piece), path.join(OUT, `${name}-${index + 1}.webp`), config.max);
        console.log(`${name}-${index + 1}`, `${info.width}x${info.height}`, `${Math.round(info.size / 1024)} KB`);
      }
    }
  }
})();
