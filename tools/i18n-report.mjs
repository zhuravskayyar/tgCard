// Lists user-facing Ukrainian strings in the client, shared code and server without a translation.
// Usage: node tools/i18n-report.mjs [output file]
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const roots = ["client/src", "shared/src", "game-core/src", "server/src"];
const tables = ["coreTranslations", "cardTranslations", "screenTranslations"].map((name) => readFileSync(`client/src/locales/${name}.ts`, "utf8")).join("\n");
const known = new Set([...tables.matchAll(/^\s*\["((?:[^"\\]|\\.)*)"/gm)].map((match) => match[1].replace(/\{[ns]\}/g, "{}")));
const skip = /(?:^|[\\/])(?:i18n\.tsx|locales|admin|migrations)(?:[\\/]|$)|\.generated\./;

function* files(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (skip.test(path)) continue;
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) yield path;
  }
}

const cyrillic = /[А-Яа-яІіЇїЄєҐґ]{2}/;
const missing = new Map();
for (const root of roots) {
  for (const path of files(root)) {
    const source = readFileSync(path, "utf8").replace(/^\s*\/\/.*$/gm, "");
    const found = [
      ...[...source.matchAll(/"([^"\n]*)"/g)].map((match) => match[1]),
      ...[...source.matchAll(/`([^`\n]*)`/g)].map((match) => match[1].replace(/\$\{[^}]*\}/g, "{}")),
      // JSX text, which may sit on its own line.
      ...[...source.matchAll(/>\s*([^<>{}]+?)\s*(?=[<{])/g)].map((match) => match[1].trim()),
    ];
    for (const text of found) {
      const trimmed = text.trim();
      if (!cyrillic.test(trimmed) || known.has(trimmed)) continue;
      if (!missing.has(trimmed)) missing.set(trimmed, path.replaceAll("\\", "/"));
    }
  }
}
const lines = [...missing].sort((a, b) => a[1].localeCompare(b[1])).map(([text, path]) => `${path}\t${text}`);
const output = process.argv[2];
if (output) writeFileSync(output, lines.join("\n") + "\n", "utf8");
console.log(`Translated rows: ${known.size}. Strings still in Ukrainian: ${missing.size}.`);
