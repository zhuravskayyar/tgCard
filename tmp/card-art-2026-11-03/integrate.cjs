// Integrate only explicitly reviewed, framed PNGs. Existing map entries are protected.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { measure } = require('./measure.cjs');
const catalog = require('./queues.json').flat();
const repo = path.resolve(__dirname, '../..');
const served = path.join(repo, 'client/public/card-art');
const mapPath = path.join(served, 'card-art-map.txt');

(async () => {
  let map = fs.readFileSync(mapPath, 'utf8');
  const existing = new Set(map.split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => l.split('|')[0].trim()));
  const records = [];
  for (const code of process.argv.slice(2)) {
    const card = catalog.find(c => c.code === code);
    if (!card) throw new Error(`Unknown code: ${code}`);
    if (existing.has(code)) throw new Error(`Already mapped: ${code}`);
    const source = path.join(__dirname, 'ready', `${code}.png`);
    const qa = await measure(source);
    if (qa.failures.length) throw new Error(`${code}: ${qa.failures.join(', ')}`);
    const target = path.join(served, `${code}.webp`);
    if (fs.existsSync(target)) throw new Error(`Existing asset protected: ${target}`);
    const buffer = await sharp(source).resize(512, 512, { kernel: 'lanczos3' })
      .webp({ quality: 88, alphaQuality: 95, effort: 6 }).toBuffer();
    const stagedWebp = path.join(__dirname, 'ready', `${code}.webp`);
    fs.writeFileSync(stagedWebp, buffer);
    const finalQa = await measure(stagedWebp);
    if (finalQa.failures.length) throw new Error(`${code} WebP: ${finalQa.failures.join(', ')}`);
    fs.writeFileSync(target, buffer);
    map = map.replace(/\s*$/, '\n') + `${code} | ${card.name} | ${code}\n`;
    existing.add(code);
    fs.writeFileSync(mapPath, map, 'utf8');
    records.push({ code, name: card.name, bytes: buffer.length, source, qa });
  }
  const log = path.join(__dirname, 'integrated.json');
  const prior = fs.existsSync(log) ? JSON.parse(fs.readFileSync(log, 'utf8')) : [];
  fs.writeFileSync(log, JSON.stringify([...prior, ...records], null, 2) + '\n');
  console.log(JSON.stringify(records.map(r => ({ code: r.code, kb: Math.round(r.bytes / 1024) })), null, 2));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
