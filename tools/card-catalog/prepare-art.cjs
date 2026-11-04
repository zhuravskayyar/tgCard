// Usage: node prepare-art.cjs <id|display name> ... ; reads ~/Downloads/<id>.png and writes the served webp plus a map line.
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const dir = "C:/Users/yarik/Desktop/tgcard/client/public/card-art/";
(async () => {
  let map = fs.readFileSync(dir + "card-art-map.txt", "utf8");
  for (const arg of process.argv.slice(2)) {
    const [id, name] = arg.split("|");
    const source = path.join(process.env.USERPROFILE, "Downloads", id + ".png");
    const info = await sharp(source).resize(512, 512, { kernel: "lanczos3" }).webp({ quality: 88, alphaQuality: 95, effort: 6 }).toFile(dir + id + ".webp");
    const meta = await sharp(dir + id + ".webp").metadata();
    if (!map.split(/\r?\n/).some((line) => line.startsWith(id + " "))) map += `${id} | ${name} | ${id}\n`;
    console.log(id, Math.round(info.size / 1024) + " KB", meta.width + "x" + meta.height, "alpha:", meta.hasAlpha);
  }
  fs.writeFileSync(dir + "card-art-map.txt", map, "utf8");
})();
