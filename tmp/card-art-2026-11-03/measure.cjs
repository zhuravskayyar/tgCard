// Read-only art QA. Usage: node measure.cjs [file-or-directory ...] [--out report.json]
// Source images and the game manifest are never modified.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const SAMPLE = 256;
const round = (value) => Math.round(value * 100) / 100;

async function measure(file) {
  const result = { file: path.resolve(file), code: path.basename(file, path.extname(file)) };
  try {
    const metadata = await sharp(file, { failOn: 'warning' }).metadata();
    // Full decoding catches incomplete downloads; reading metadata alone does not.
    const decoded = await sharp(file, { failOn: 'warning' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = decoded.info;
    const raw = decoded.data;
    const alpha = (x, y) => raw[(y * width + x) * channels + channels - 1];
    const corners = [alpha(0, 0), alpha(width - 1, 0), alpha(0, height - 1), alpha(width - 1, height - 1)];
    let edgePixels = 0;
    let edgeMaxAlpha = 0;
    const edge = (a) => { edgeMaxAlpha = Math.max(edgeMaxAlpha, a); if (a >= 10) edgePixels++; };
    for (let x = 0; x < width; x++) { edge(alpha(x, 0)); if (height > 1) edge(alpha(x, height - 1)); }
    for (let y = 1; y < height - 1; y++) { edge(alpha(0, y)); if (width > 1) edge(alpha(width - 1, y)); }

    const sampled = await sharp(raw, { raw: { width, height, channels } }).resize(SAMPLE, SAMPLE).ensureAlpha().raw().toBuffer();
    let transparent = 0, opaque = 0, dark = 0, solid = 0, medallion = 0;
    let minX = SAMPLE, maxX = -1, minY = SAMPLE, maxY = -1;
    for (let y = 0; y < SAMPLE; y++) {
      for (let x = 0; x < SAMPLE; x++) {
        const i = (y * SAMPLE + x) * 4;
        if (sampled[i + 3] < 10) { transparent++; continue; }
        opaque++;
        if (sampled[i] < 70) dark++;
        if (sampled[i + 3] >= 245) solid++;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        if (x >= SAMPLE * 0.75 && y >= SAMPLE * 0.75) medallion++;
      }
    }
    const transparentPct = round(transparent / (SAMPLE * SAMPLE) * 100);
    const darkPct = opaque ? round(dark / opaque * 100) : 0;
    const medallionPct = round(medallion / ((SAMPLE / 4) ** 2) * 100);
    const bboxPct = opaque ? [minX, maxX + 1, minY, maxY + 1].map((n) => round(n / SAMPLE * 100)) : null;
    const failures = [];
    const warnings = [];
    if (width !== height) failures.push('non_square_canvas');
    if (!metadata.hasAlpha) failures.push('no_alpha_channel');
    if (corners.some((n) => n !== 0)) failures.push('nontransparent_corner');
    if (!opaque) failures.push('empty_image');
    if (transparentPct < 40) failures.push('transparency_below_40pct');
    if (edgePixels) failures.push('subject_touches_canvas_edge');
    if (medallionPct > 5) failures.push('medallion_fill_above_5pct');
    if (darkPct < 25 || darkPct > 45) warnings.push('dark_pixel_ratio_outside_25_to_45pct');
    if (bboxPct && (bboxPct[0] < 5 || bboxPct[1] > 95 || bboxPct[2] < 5 || bboxPct[3] > 95)) warnings.push('subject_margin_below_5pct');
    return Object.assign(result, {
      decoded: true, format: metadata.format, width, height,
      bytes: fs.statSync(file).size, hasAlpha: !!metadata.hasAlpha,
      cornerAlphas: corners, edgePixels, edgeMaxAlpha,
      sampleSize: SAMPLE, transparentPct, darkPct,
      solidInteriorPct: opaque ? round(solid / opaque * 100) : 0,
      bboxPct, medallionPct, failures, warnings,
      needsVisualReview: ['subject_and_style', 'opaque_cream_fill', 'silhouette_at_100px', 'anatomy_and_four_digit_hands', 'pose_action', 'mechanical_connections'],
    });
  } catch (error) {
    return Object.assign(result, { decoded: false, failures: ['decode_failed'], error: error.message });
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node measure.cjs [file-or-directory ...] [--out report.json]');
    console.log('Default input: sibling originals directory. No source images or map are changed.');
    return;
  }
  let out;
  const index = args.indexOf('--out');
  if (index !== -1) { out = args[index + 1]; if (!out) throw new Error('--out requires a path'); args.splice(index, 2); }
  const inputs = args.length ? args : [path.join(__dirname, 'originals')];
  const files = [];
  for (const input of inputs) {
    if (!fs.existsSync(input)) continue;
    if (fs.statSync(input).isDirectory()) {
      for (const name of fs.readdirSync(input).sort()) if (/\.(png|webp)$/i.test(name)) files.push(path.join(input, name));
    } else files.push(input);
  }
  const results = [];
  for (const file of [...new Set(files.map((file) => path.resolve(file)))]) results.push(await measure(file));
  const report = { measuredAt: new Date().toISOString(), sourceImagesModified: false, results };
  if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify(report, null, 2));
}

module.exports = { measure };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
