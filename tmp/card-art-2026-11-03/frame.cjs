// Deterministic framing only: uniform scale and translation of the ENTIRE source
// canvas onto a transparent canvas. Never crops, paints, edits, or overwrites a source.
// Usage: node frame.cjs <code ...> [--write] [--force]
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { measure } = require('./measure.cjs');
const S = 256;
const MIN_MARGIN = 0.06, MAX_BOUND = 0.94, CORNER_LIMIT = 4.5;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

async function plan(source) {
  const data = await sharp(source, { failOn: 'warning' }).resize(S, S).ensureAlpha().raw().toBuffer();
  let x0 = S, x1 = 0, y0 = S, y1 = 0, count = 0, sumX = 0;
  const mask = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (data[(y * S + x) * 4 + 3] < 10) continue;
    mask[y * S + x] = 1; count++; sumX += x;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1);
  }
  if (!count) throw new Error('Source is empty');
  x0 /= S; x1 /= S; y0 /= S; y1 /= S;
  const visualCenterX = ((x0 + x1) / 2 + sumX / count / S) / 2;
  const centerY = (y0 + y1) / 2;
  for (let step = 0; step <= 60; step++) {
    const scale = 1 - step * 0.005;
    const room = 1 - scale;
    const choicesX = [...new Set([0, room / 4, room / 2, room * 3 / 4, room, clamp(0.48 - visualCenterX * scale, 0, room)])];
    const choicesY = [...new Set([0, room / 4, room / 2, room * 3 / 4, room, clamp(0.5 - centerY * scale, 0, room)])];
    const candidates = [];
    for (const left of choicesX) for (const top of choicesY) {
      if (left + x0 * scale < MIN_MARGIN || left + x1 * scale > MAX_BOUND || top + y0 * scale < MIN_MARGIN || top + y1 * scale > MAX_BOUND) continue;
      let corner = 0;
      for (let y = S * 0.75; y < S; y++) for (let x = S * 0.75; x < S; x++) {
        const ox = Math.floor(((x + 0.5) / S - left) / scale * S);
        const oy = Math.floor(((y + 0.5) / S - top) / scale * S);
        if (ox >= 0 && ox < S && oy >= 0 && oy < S) corner += mask[oy * S + ox];
      }
      const medallionPct = corner / ((S / 4) ** 2) * 100;
      if (medallionPct > CORNER_LIMIT) continue;
      const score = Math.abs(left + visualCenterX * scale - 0.48) + Math.abs(top + centerY * scale - 0.5);
      candidates.push({ scale, left, top, medallionPct, score });
    }
    if (candidates.length) return candidates.sort((a, b) => a.score - b.score)[0];
  }
  throw new Error('Could not preserve whole artwork and satisfy margins/corner within 70% source scale');
}

async function frame(code, write, force) {
  if (!/^[a-z0-9_]+$/.test(code)) throw new Error('Expected a simple card code');
  const source = path.join(__dirname, 'originals', code + '.png');
  const destination = path.join(__dirname, 'ready', code + '.png');
  const original = await measure(source);
  if (!original.decoded || !original.hasAlpha || original.width !== original.height || original.transparentPct < 40) throw new Error(code + ': source requires content correction, not framing');
  if (original.edgePixels) throw new Error(code + ': source already touches an edge; framing cannot restore cropped artwork');
  const transform = await plan(source);
  const width = original.width;
  const scaled = Math.round(width * transform.scale);
  const left = clamp(Math.round(width * transform.left), 0, width - scaled);
  const top = clamp(Math.round(width * transform.top), 0, width - scaled);
  const result = { code, source, destination, write, transform: { scale: scaled / width, left, top }, original };
  if (!write) return result;
  if (fs.existsSync(destination) && !force) throw new Error(destination + ' exists; use --force only to replace a derived ready copy');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const piece = await sharp(source, { failOn: 'warning' }).resize(scaled, scaled, { kernel: 'lanczos3' }).png().toBuffer();
  const output = await sharp({ create: { width, height: width, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: piece, left, top }]).png().toBuffer();
  // Check the final pixels, not merely the predicted mask, before saving.
  const tmpFile = destination + '.qa-pending.png';
  try {
    fs.writeFileSync(tmpFile, output);
    result.framed = await measure(tmpFile);
    if (result.framed.failures.length) throw new Error(code + ': actual framed pixels failed: ' + result.framed.failures.join(', '));
    fs.renameSync(tmpFile, destination);
    result.framed.file = destination;
    result.framed.code = code;
  } finally { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || !args.length) { console.log('Usage: node frame.cjs <code ...> [--write] [--force]'); return; }
  const write = args.includes('--write'), force = args.includes('--force');
  const results = [];
  for (const code of args.filter((arg) => !arg.startsWith('--'))) results.push(await frame(code, write, force));
  console.log(JSON.stringify(results, null, 2));
}
module.exports = { plan, frame };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
