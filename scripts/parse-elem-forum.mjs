import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_URL = "https://elem.mobi/forum/3/224901/#15636768";
const stdinMode = process.argv[2] === "--stdin";
const sourceUrl = stdinMode ? (process.argv[3] ?? DEFAULT_URL) : (process.argv[2] ?? DEFAULT_URL);
const outputFile = resolve(process.cwd(), stdinMode ? (process.argv[4] ?? "docs/reference-elem-witches-raids.json") : (process.argv[3] ?? "docs/reference-elem-witches-raids.json"));

function decodeEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);?/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function attributeValue(attributes, name) {
  const quoted = attributes.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  if (quoted) return decodeEntities(quoted[1]);
  const unquoted = attributes.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, "i"));
  return unquoted ? decodeEntities(unquoted[1]) : null;
}

function cleanText(fragment) {
  return decodeEntities(fragment
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<\/(?:td|th)\s*>/gi, "\t")
    .replace(/<[^>]+>/g, " "))
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function extractElement(source, start) {
  const openingEnd = source.indexOf(">", start);
  if (openingEnd < 0) return source.slice(start);
  const divTags = /<\/?div\b[^>]*>/gi;
  divTags.lastIndex = openingEnd + 1;
  let depth = 1;
  for (const match of source.matchAll(divTags)) {
    if (match[0].startsWith("</")) depth -= 1;
    else if (!/\/\s*>$/.test(match[0])) depth += 1;
    if (depth === 0) return source.slice(start, match.index + match[0].length);
  }
  return source.slice(start);
}

function resolveUrl(value, baseUrl) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

function extractArticle(source) {
  const anchor = source.search(/<a\b[^>]*\bid\s*=\s*["']15636768["'][^>]*>/i);
  const candidates = [...source.matchAll(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bt\b[^"']*["'][^>]*>/gi)]
    .map((match) => match.index)
    .filter((index) => anchor < 0 || index <= anchor);
  const start = candidates.at(-1);
  return start === undefined ? source : extractElement(source, start);
}

function extractLinks(fragment, baseUrl) {
  const links = [];
  for (const match of fragment.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const url = resolveUrl(attributeValue(match[1] ?? "", "href"), baseUrl);
    if (!url) continue;
    links.push({ label: cleanText(match[2] ?? ""), url });
  }
  return links.filter((link, index, all) => all.findIndex((item) => item.url === link.url && item.label === link.label) === index);
}

function extractImages(fragment, baseUrl) {
  const images = [];
  for (const match of fragment.matchAll(/<img\b([^>]*)>/gi)) {
    const url = resolveUrl(attributeValue(match[1] ?? "", "src"), baseUrl);
    if (!url) continue;
    images.push({
      url,
      alt: attributeValue(match[1] ?? "", "alt") ?? "",
      className: attributeValue(match[1] ?? "", "class") ?? "",
      width: attributeValue(match[1] ?? "", "width"),
      height: attributeValue(match[1] ?? "", "height"),
    });
  }
  return images.filter((image, index, all) => all.findIndex((item) => item.url === image.url) === index);
}

function cleanNumber(value) {
  if (!value) return null;
  const number = Number(value.replace(/[\s.,]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function parseLevels(text) {
  const levels = [];
  const blocks = [...text.matchAll(/Уровень\s+(\d+)([\s\S]*?)(?=Уровень\s+\d+|$)/gi)];
  for (const match of blocks) {
    const block = match[2] ?? "";
    const health = block.match(/Здоровье\s*:\s*([\d\s.,]+)/i);
    const uniquePower = block.match(/Сила\s+уникальной\s+карты\s*:\s*([\d\s.,]+)/i);
    const treasure = block.match(/Карта\s+в\s+кладе\s*:\s*(\d+)\s*,\s*([\d\s.,]+)/i);
    if (!health || !uniquePower || !treasure) continue;
    levels.push({
      level: Number(match[1]),
      health: cleanNumber(health[1]),
      uniqueCardPower: cleanNumber(uniquePower[1]),
      treasure: { cards: Number(treasure[1]), power: cleanNumber(treasure[2]) },
    });
  }
  return levels.filter((level, index, all) => all.findIndex((item) => item.level === level.level) === index);
}

function matchingLines(lines, pattern) {
  return lines.filter((line) => pattern.test(line));
}

function localizeWitchTerminology(value) {
  const forms = [
    [/колдуньями/giu, "відьмами"],
    [/колдуньях/giu, "відьмах"],
    [/колдуньей/giu, "відьмою"],
    [/колдуний/giu, "відьом"],
    [/колдуньи/giu, "відьми"],
    [/колдунью/giu, "відьму"],
    [/колдунье/giu, "відьмі"],
    [/колдунья/giu, "відьма"],
    [/ведьмами/giu, "відьмами"],
    [/ведьмах/giu, "відьмах"],
    [/ведьмой/giu, "відьмою"],
    [/ведьмы/giu, "відьми"],
    [/ведьму/giu, "відьму"],
    [/ведьме/giu, "відьмі"],
    [/ведьм/giu, "відьом"],
  ];
  return forms.reduce((result, [pattern, replacement]) => result.replace(pattern, (match) => {
    if (match === match.toUpperCase()) return replacement.toUpperCase();
    if (match[0] === match[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
    return replacement;
  }), value);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const response = stdinMode ? null : await fetch(sourceUrl, {
  headers: {
    Accept: "text/html",
    "User-Agent": "Cardastika-elem-reference-parser/1.0",
  },
});
const html = stdinMode ? await readStdin() : await response.text();
const articleHtml = extractArticle(html);
const cleanedArticleText = cleanText(articleHtml);
const articleHeadingIndex = cleanedArticleText.search(/Рейды\s+на\s+колдун/i);
const parseStatus = articleHeadingIndex >= 0 ? "complete" : "incomplete";
const rawArticleText = (articleHeadingIndex >= 0 ? cleanedArticleText.slice(articleHeadingIndex) : cleanedArticleText)
  .replace(/\nК\s+оглавлению[\s\S]*$/i, "")
  .trim();
const articleText = localizeWitchTerminology(rawArticleText);
const lines = articleText.split("\n");
const levels = parseLevels(rawArticleText);
const collections = [...rawArticleText.matchAll(/коллекц[а-яёa-z]*\s+[«"]([^»"]+)[»"]/giu)].map((match) => localizeWitchTerminology(match[1].trim()))
  .filter((name, index, all) => all.indexOf(name) === index);
const ruleLines = matchingLines(rawArticleText.split("\n"), /34\s+уров|запис|рейд.?чат|без\s+перерыв|лечен|75\s*%|50\s*%|25\s*%|проклят|60\s*сек|10\s*%|10\s+запис|шанс|колод/i).map(localizeWitchTerminology);
const sourceTitle = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "");
const output = {
  parserVersion: 1,
  parseStatus,
  ...(parseStatus === "incomplete" ? { warning: "The fetched HTML did not contain the target forum article. Use --stdin with HTML captured from the browser session." } : {}),
  source: {
    url: sourceUrl,
    fetchedAt: new Date().toISOString(),
    httpStatus: response?.status ?? null,
    transport: stdinMode ? "browser-captured-html" : "direct-fetch",
    title: sourceTitle,
  },
  article: {
    title: "Рейди на відьом",
    text: articleText,
    lines,
  },
  mechanics: {
    access: lines.find((line) => /34\s+уров/i.test(line)) ?? null,
    maxLevel: levels.length ? Math.max(...levels.map((level) => level.level)) : null,
    levels,
    collections,
    healingThresholdsPercent: /75\s*%[\s\S]*50\s*%[\s\S]*25\s*%/i.test(articleText) ? [75, 50, 25] : [],
    curse: /60\s*сек[\s\S]*10\s*%/i.test(articleText)
      ? { intervalSeconds: 60, maxHealthDamagePercent: 10 }
      : null,
    battleLogCapacity: /10\s+(?:последн|запис)/i.test(articleText) ? 10 : null,
    extractedRuleLines: ruleLines,
  },
  referencedImages: extractImages(articleHtml, sourceUrl),
  referencedLinks: extractLinks(articleHtml, sourceUrl),
};

await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Parsed ${sourceUrl}`);
console.log(`Saved ${outputFile}`);
console.log(`Status: ${response?.status ?? "browser HTML"}; levels: ${levels.length}; images: ${output.referencedImages.length}; collections: ${collections.length}`);
