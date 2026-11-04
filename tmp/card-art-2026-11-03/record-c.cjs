const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
(async () => {
  const [code, request, notes] = process.argv.slice(2);
  const dir = __dirname;
  const prompts = JSON.parse(fs.readFileSync(path.join(dir, 'agent-c-prompts.json'), 'utf8'));
  const entry = prompts.find((p) => p.code === code);
  if (!entry) throw new Error('Unknown card code');
  const imagePath = path.join(dir, 'originals', code + '.png');
  const meta = await sharp(imagePath).metadata();
  const S = 256;
  const data = await sharp(imagePath).resize(S, S).ensureAlpha().raw().toBuffer();
  let transparent = 0, opaque = 0, dark = 0, corner = 0;
  const bbox = [S, 0, S, 0];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const o = (y * S + x) * 4;
    if (data[o + 3] < 10) transparent++;
    else {
      opaque++; if (data[o] < 70) dark++;
      bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.max(bbox[1], x);
      bbox[2] = Math.min(bbox[2], y); bbox[3] = Math.max(bbox[3], y);
      if (x > S * .75 && y > S * .75) corner++;
    }
  }
  const output = path.join(dir, 'agent-c.json');
  const records = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : [];
  const record = {...entry, path: imagePath, request: Number(request), chatUrl:'https://chatgpt.com/c/6ae9cc75-286c-83eb-b407-7c0efccdd229', notes,
    metrics: {width:meta.width, height:meta.height, hasAlpha:meta.hasAlpha, transparentPct:transparent/S/S*100,
      darkPct:dark/opaque*100, cornerPct:corner/(S*S/16)*100, bboxPct:bbox.map((v)=>v/S*100)}};
  const index = records.findIndex((r) => r.code === code);
  if (index === -1) records.push(record); else records[index] = record;
  fs.writeFileSync(output, JSON.stringify(records, null, 2), 'utf8');
  console.log(JSON.stringify({code, ...record.metrics}));
})();
