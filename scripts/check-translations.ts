// Finds Ukrainian interface text that the runtime translator leaves untranslated.
// Every Ukrainian string literal, template and JSX text in the client is run through the real
// translateUi(); if the English result still contains Cyrillic, the phrase has no translation.
// Run: npx tsx scripts/check-translations.ts [--all-locales] [--json]
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { translateUi, type UiLocale } from "../client/src/i18n";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCAN_DIRS = ["client/src", "shared/src", "game-core/src", "server/src"];
/** Admin tools, the Telegram bot chat, dev seeds and reference parsers are not part of the translated game UI. */
const SKIP_DIRS = ["client/src/locales", "client/src/admin", "server/src/admin", "server/src/bot", "server/src/dev", "server/src/database", "server/src/reference"];
const SKIP_FILES = [
  "client/src/i18n.tsx",
  // Not imported anywhere yet.
  "server/src/cards/cardDescriptions.ts",
  // Russian reference material parsed from an external forum, shown as-is.
  "game-core/src/equipmentManual.ts",
  "game-core/src/guildForumReference.ts",
];
/** Text that is Ukrainian on purpose in every language (the language picker itself). */
const ALLOWED = new Set<string>(["Українська", "Русский"]);
/**
 * SQL and regular-expression character classes contain Cyrillic but are not displayed text.
 * SVG/HTML markup is skipped too: its attributes are translated once the markup is in the page.
 */
const NOT_DISPLAYED = /\b(COALESCE|NULLIF|VALUES|SELECT|INSERT|UPDATE)\b|А-Я|а-я|АБВГ|^\s*</;
const CYRILLIC = /[А-Яа-яІіЇїЄєҐґЁёЪъЫыЭэ]/;
const SAMPLE = "{s}";

const args = new Set(process.argv.slice(2));
const locales: UiLocale[] = args.has("--all-locales") ? ["en", "de", "ru"] : ["en"];

interface Finding { file: string; line: number; text: string; locale: UiLocale; result: string }

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.includes(rel) ? [] : walk(rel);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name) || SKIP_FILES.includes(rel)) return [];
    return [rel];
  });
}

/** Not shown to players: imports, object keys, type literals, data attributes, console output. */
function isNonUiPosition(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isLiteralTypeNode(parent)) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return true;
  if (ts.isJsxAttribute(parent) && /^(className|data-|key|id|href|src)/.test(parent.name.getText())) return true;
  if (ts.isCallExpression(parent) && /^console\.|\.(startsWith|endsWith|includes|split|querySelector)/.test(parent.expression.getText())) return true;
  return false;
}

const MAX_VARIANTS = 64;

/**
 * Every text an expression can render. Literal branches of `a ? "x" : "y"` and nested templates are
 * spelled out, so `посів${female ? "ла" : ""}` is checked as both "посів" and "посіла".
 * Anything else (a number, a name, a variable) becomes a {s} placeholder.
 */
function variants(expr: ts.Expression, covered: Set<ts.Node>): string[] {
  if (ts.isParenthesizedExpression(expr)) return variants(expr.expression, covered);
  if (expr.kind === ts.SyntaxKind.NullKeyword || expr.kind === ts.SyntaxKind.FalseKeyword || (ts.isIdentifier(expr) && expr.text === "undefined")) return [""];
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    covered.add(expr);
    return [expr.text];
  }
  if (ts.isConditionalExpression(expr)) return [...variants(expr.whenTrue, covered), ...variants(expr.whenFalse, covered)].slice(0, MAX_VARIANTS);
  if (ts.isBinaryExpression(expr) && (expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || expr.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
    return [...variants(expr.left, covered), ...variants(expr.right, covered)].slice(0, MAX_VARIANTS);
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    covered.add(expr);
    const left = variants(expr.left, covered);
    const right = variants(expr.right, covered);
    return left.flatMap((head) => right.map((tail) => head + tail)).slice(0, MAX_VARIANTS);
  }
  if (ts.isTemplateExpression(expr)) {
    covered.add(expr);
    let results = [expr.head.text];
    for (const span of expr.templateSpans) {
      const inner = variants(span.expression, covered);
      results = results.flatMap((prefix) => inner.map((value) => prefix + value + span.literal.text)).slice(0, MAX_VARIANTS);
    }
    return results;
  }
  return [SAMPLE];
}

/** JSX children rendered as separate text nodes are translated together, as the runtime does. */
function jsxChildrenVariants(element: ts.JsxElement, covered: Set<ts.Node>): string[] | null {
  let results = [""];
  for (const child of element.children) {
    let parts: string[];
    if (ts.isJsxText(child)) parts = [child.text];
    else if (ts.isJsxExpression(child) && child.expression && !ts.isJsxElement(child.expression) && !ts.isJsxFragment(child.expression)) parts = variants(child.expression, covered);
    else return null;
    results = results.flatMap((prefix) => parts.map((part) => prefix + part)).slice(0, MAX_VARIANTS);
  }
  return results;
}

function collect(file: string): Array<{ line: number; text: string }> {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Array<{ line: number; text: string }> = [];
  const covered = new Set<ts.Node>();
  const add = (node: ts.Node, text: string) => {
    if (NOT_DISPLAYED.test(text)) return;
    for (const piece of text.split("\n")) {
      // `index + 1` is arithmetic, not two separate values.
      const trimmed = piece.replace(/\s+/g, " ").replace(/(\{s\})+/g, "{s}").trim();
      if (trimmed && CYRILLIC.test(trimmed) && !ALLOWED.has(trimmed)) out.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: trimmed });
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && node.children.some((child) => ts.isJsxExpression(child))) {
      const merged = jsxChildrenVariants(node, covered);
      if (merged) merged.forEach((text) => add(node, text));
    }
    if (!covered.has(node)) {
      if (ts.isJsxText(node)) {
        if (!(ts.isJsxElement(node.parent) && covered.has(node.parent))) add(node, node.text);
      } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isNonUiPosition(node)) add(node, node.text);
      else if (ts.isTemplateExpression(node) && !isNonUiPosition(node)) variants(node, covered).forEach((text) => add(node, text));
      // `"Виключити " + name + " з гільдії?"` is one phrase; only the outermost `+` is checked.
      else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken && !(ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken)) {
        const texts = variants(node, covered);
        if (texts.some((text) => text !== SAMPLE)) texts.forEach((text) => add(node, text));
      }
    }
    if (ts.isJsxElement(node) && node.children.some((child) => ts.isJsxExpression(child)) && jsxChildrenVariants(node, new Set()) !== null) covered.add(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const findings: Finding[] = [];
const seen = new Set<string>();
for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    for (const { line, text } of collect(file)) {
      for (const locale of locales) {
        const result = translateUi(text.replaceAll("{s}", "7"), locale);
        // Russian shares Cyrillic, so only letters that exist in Ukrainian alone reveal an untranslated phrase.
        const leftover = locale === "ru" ? /[ІіЇїЄєҐґ]/.test(result) : CYRILLIC.test(result);
        if (!leftover) continue;
        const key = `${locale}|${text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({ file, line, text, locale, result });
      }
    }
  }
}

if (args.has("--json")) {
  console.log(JSON.stringify(findings, null, 1));
} else {
  for (const finding of findings) console.log(`${finding.file}:${finding.line} [${finding.locale}] ${finding.text}`);
  console.log(`\n${findings.length} untranslated phrase(s).`);
}
process.exitCode = findings.length ? 1 : 0;
