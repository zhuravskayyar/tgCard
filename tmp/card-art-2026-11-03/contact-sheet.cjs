// Static QA previews only. Sources are untouched; every thumbnail is exactly100px.
const fs = require('node:fs'), path = require('node:path'), sharp = require('sharp');
const root = __dirname;
const escape = (s) => s.replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
(async () => {
  const files = fs.readdirSync(path.join(root, 'ready')).filter((f) => f.endsWith('.png')).sort();
  const cols = 5, cellW = 196, cellH = 156, header = 34;
  const width = cols * cellW, height = header + Math.ceil(files.length / cols) * cellH;
  const art = [], silhouettes = [];
  const labels = [];
  for (let i = 0; i < files.length; i++) {
    const x = i % cols * cellW, y = Math.floor(i / cols) * cellH + header;
    const buffer = await sharp(path.join(root, 'ready', files[i])).resize(100, 100).ensureAlpha().raw().toBuffer();
    const png = await sharp(buffer, { raw: { width: 100, height: 100, channels: 4 } }).png().toBuffer();
    const mask = Buffer.from(buffer);
    for (let p = 0; p < mask.length; p += 4) mask[p] = mask[p + 1] = mask[p + 2] = 23;
    const silhouette = await sharp(mask, { raw: { width: 100, height: 100, channels: 4 } }).png().toBuffer();
    art.push({ input: png, left: x + 48, top: y + 4 });
    silhouettes.push({ input: silhouette, left: x + 48, top: y + 4 });
    const code = files[i].slice(0, -4);
    const lines = code.length <= 28 ? [code] : [code.slice(0, 27), code.slice(27)];
    lines.forEach((line, n) => labels.push(`<text x="${x + cellW / 2}" y="${y + 125 + n * 13}" text-anchor="middle">${escape(line)}</text>`));
  }
  const labelSvg = Buffer.from(`<svg width="${width}" height="${height}"><g font-family="Arial,sans-serif" font-size="11" fill="#30271d">${labels.join('')}</g><text x="16" y="22" font-family="Arial,sans-serif" font-size="15" fill="#30271d">${files.length} accepted cards - actual100px thumbnails - static QA</text></svg>`);
  fs.mkdirSync(path.join(root, 'qa'), { recursive: true });
  for (const [kind, items] of [['art', art], ['silhouettes', silhouettes]]) {
    const out = path.join(root, 'qa', `contact-${kind}-${files.length}.png`);
    await sharp({ create: { width, height, channels: 4, background: '#d2bc8c' } }).composite([...items, { input: labelSvg, left: 0, top: 0 }]).png().toFile(out);
    console.log(out);
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
