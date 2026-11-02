// Procedural sound design for Cardastika (round 3 of the audio review).
// Pure DSP, no AI models: modal synthesis, filtered noise, Karplus-Strong plucks, a small Schroeder reverb,
// optionally layered with CC0 recordings already reviewed in round 2. Seeded, so every run is identical.
// Usage: node tools/audio-synth/synth.mjs   (needs ffmpeg in PATH)
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REVIEW = join(ROOT, "docs/audio-review");
const OUT = join(REVIEW, "audio/round-3");
const RECORDINGS = join(REVIEW, "audio/round-2");
const SR = 44100;

// ---------- primitives ----------
let seed = 1;
const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rnd = (a, b) => a + rand() * (b - a);
const buf = (sec) => new Float32Array(Math.ceil(sec * SR));
const at = (sec) => Math.round(sec * SR);
const db = (value) => 10 ** (value / 20);
const val = (v, t) => (typeof v === "function" ? v(t) : v);

function mix(dst, src, offsetSec = 0, gain = 1) {
  const o = at(offsetSec);
  for (let i = 0; i < src.length && o + i < dst.length; i += 1) if (o + i >= 0) dst[o + i] += src[i] * gain;
  return dst;
}

/** Damped sinusoid; freq may be a function of time for pitch drops. */
function tone(dur, freq, decay, { attack = 0.002, amp = 1, phase = 0 } = {}) {
  const out = buf(dur);
  let ph = phase;
  for (let i = 0; i < out.length; i += 1) {
    const t = i / SR;
    ph += (2 * Math.PI * val(freq, t)) / SR;
    out[i] = Math.sin(ph) * amp * Math.min(1, t / attack) * Math.exp(-t / decay);
  }
  return out;
}

/** Sum of inharmonic partials: the core of wood, metal, coins and bells. */
function modal(dur, base, ratios, amps, decays, opts = {}) {
  const out = buf(dur);
  ratios.forEach((ratio, k) => mix(out, tone(dur, base * ratio, decays[k], { ...opts, amp: amps[k], phase: rand() * 6.28 })));
  return out;
}

function noise(dur, env = () => 1) {
  const out = buf(dur);
  for (let i = 0; i < out.length; i += 1) out[i] = (rand() * 2 - 1) * env(i / SR);
  return out;
}

/** RBJ biquad with optionally time-varying cutoff (recomputed every 16 samples). */
function filter(input, type, freq, q = 0.707) {
  const out = new Float32Array(input.length);
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i += 1) {
    if (i % 16 === 0) {
      const f = Math.min(SR * 0.45, Math.max(20, val(freq, i / SR)));
      const w = (2 * Math.PI * f) / SR, cos = Math.cos(w), alpha = Math.sin(w) / (2 * val(q, i / SR));
      const a0 = 1 + alpha;
      if (type === "lp") { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
      else if (type === "hp") { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
      else { b0 = alpha; b1 = 0; b2 = -alpha; }
      b0 /= a0; b1 /= a0; b2 /= a0; a1 = (-2 * cos) / a0; a2 = (1 - alpha) / a0;
    }
    const x = input[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; out[i] = y;
  }
  return out;
}

const envelope = (input, env) => input.map((x, i) => x * env(i / SR));
const saturate = (input, drive) => input.map((x) => Math.tanh(x * drive) / Math.tanh(drive));
const ar = (attack, release) => (t) => (t < attack ? t / attack : Math.exp(-(t - attack) / release));

/** Karplus-Strong pluck: a dry lute/harp string. */
function pluck(dur, freq, { damp = 0.996, bright = 0.5, amp = 1 } = {}) {
  const out = buf(dur);
  const n = Math.max(2, Math.round(SR / freq));
  const line = Float32Array.from({ length: n }, () => rand() * 2 - 1);
  let prev = 0;
  for (let i = 0; i < out.length; i += 1) {
    const k = i % n;
    const next = line[k];
    const avg = (bright * next + (1 - bright) * prev);
    prev = next;
    line[k] = ((next + avg) / 2) * damp;
    out[i] = next * amp;
  }
  return filter(out, "lp", freq * 9);
}

/** Small room so every synthetic sound sits in the same "table and book" space. */
function room(input, wet = 0.18, tail = 0.5, size = 1) {
  const out = new Float32Array(input.length + at(tail));
  out.set(input);
  const combs = [1116, 1188, 1277, 1356].map((d) => ({ d: Math.round(d * size), line: new Float32Array(Math.round(d * size)), idx: 0, lp: 0 }));
  const allpasses = [556, 441].map((d) => ({ line: new Float32Array(d), idx: 0 }));
  for (let i = 0; i < out.length; i += 1) {
    const x = i < input.length ? input[i] : 0;
    let sum = 0;
    for (const c of combs) {
      const y = c.line[c.idx];
      c.lp = y * 0.6 + c.lp * 0.4;
      c.line[c.idx] = x + c.lp * 0.8;
      c.idx = (c.idx + 1) % c.line.length;
      sum += y;
    }
    let y = sum / 4;
    for (const a of allpasses) {
      const b = a.line[a.idx];
      a.line[a.idx] = y + b * 0.5;
      y = b - y * 0.5;
      a.idx = (a.idx + 1) % a.line.length;
    }
    out[i] += y * wet;
  }
  return out;
}

/** Many tiny filtered noise grains: paper crinkle, fire crackle, gravel. */
function grains(dur, count, { lo = 2000, hi = 6000, len = [0.002, 0.008], amp = [0.3, 1], density = () => 1 } = {}) {
  const out = buf(dur);
  for (let k = 0; k < count; k += 1) {
    let t = rnd(0, dur);
    if (rand() > density(t / dur)) continue;
    const g = filter(noise(rnd(len[0], len[1]), ar(0.0005, rnd(len[0], len[1]) / 3)), "bp", rnd(lo, hi), 1.4);
    mix(out, g, t, rnd(amp[0], amp[1]));
  }
  return out;
}

function recording(file) {
  const result = spawnSync("ffmpeg", ["-v", "error", "-i", join(RECORDINGS, file), "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"], { maxBuffer: 1 << 26 });
  if (result.status !== 0) throw new Error(`ffmpeg failed on ${file}: ${result.stderr}`);
  const b = result.stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

/** Recording aligned so its first transient lands at 0, cut to `dur` with a short fade. */
function layer(file, dur) {
  const data = recording(file);
  const peak = data.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  const onset = Math.max(0, data.findIndex((x) => Math.abs(x) > peak * 0.25) - at(0.004));
  const out = data.slice(onset, onset + at(dur));
  const fade = at(0.03);
  for (let i = 0; i < fade && i < out.length; i += 1) out[out.length - 1 - i] *= i / fade;
  return out.map((x) => x / (peak || 1));
}

// ---------- building blocks ----------
const woodKnock = (f0, { dur = 0.14, muffle = 9000 } = {}) => {
  const body = modal(dur, f0, [1, 2.57, 4.1, 6.3], [1, 0.45, 0.22, 0.1], [0.04, 0.026, 0.016, 0.01], { attack: 0.0008 });
  const click = filter(noise(0.004, ar(0.0003, 0.0012)), "hp", 2500);
  return filter(mix(body, click, 0, 0.5), "lp", muffle);
};
const bell = (freq, decay = 0.5, dur = decay * 3) => modal(dur, freq, [1, 2.76, 5.4, 8.93], [1, 0.4, 0.18, 0.06], [decay, decay * 0.5, decay * 0.3, decay * 0.15], { attack: 0.001 });
const coinHit = (base, amp = 1) => {
  const ring = modal(0.5, base, [1, 1.48, 2.15, 2.92], [0.7, 1, 0.6, 0.35], [0.22, 0.16, 0.09, 0.05], { attack: 0.0005 });
  return mix(ring, filter(noise(0.003, ar(0.0002, 0.001)), "hp", 4000), 0, 0.6).map((x) => x * amp);
};
const thump = (from, to, dur, decay) => tone(dur, (t) => to + (from - to) * Math.exp(-t / (decay * 0.35)), decay, { attack: 0.001 });
const slap = (dur = 0.03, cutoff = 1500) => filter(noise(dur, ar(0.0006, dur / 4)), "hp", cutoff);
const whoosh = (dur, from, peak, to, q = 1.3) => {
  const center = (t) => (t < dur / 2 ? from + (peak - from) * (t / (dur / 2)) : peak + (to - peak) * ((t - dur / 2) / (dur / 2)));
  return filter(noise(dur, (t) => Math.sin(Math.PI * Math.min(1, t / dur)) ** 1.6), "bp", center, q);
};
const note = (name) => {
  const map = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const [, letter, sharp, octave] = name.match(/([A-G])(#?)(\d)/);
  return 440 * 2 ** ((map[letter] + (sharp ? 1 : 0) + (Number(octave) - 4) * 12) / 12);
};

// ---------- cues ----------
const SYNTH = "cardastika-synth";
const cues = [];
const cue = (id, group, title, description, target, build, { layers = [] } = {}) => cues.push({ id, group, title, description, target, build, layers });

const G = { ui: "Інтерфейс", cards: "Карти й паки", coins: "Монети й нагороди", battle: "Бій", element: "Стихії — тихий шар до удару", result: "Результат бою", gear: "Спорядження й кузня" };

cue("ui-tap", G.ui, "Натискання — сухе дерево", "Коротке постукування по дерев’яній палітурці. Основа для всіх кнопок; у грі висота щоразу трохи змінюється.", -26, () => woodKnock(640));
cue("ui-tap-soft", G.ui, "Натискання — м’якше, через сукно", "Той самий стук, приглушений. Якщо основний здасться різким для частих кнопок.", -27, () => woodKnock(470, { muffle: 2600 }));
cue("ui-back", G.ui, "Назад", "Два стуки вниз: «повернулись на крок».", -27, () => mix(woodKnock(560, { dur: 0.2 }), woodKnock(420), 0.05, 0.7));
cue("ui-confirm", G.ui, "Підтвердження", "Стук і маленький дзвіночок — для дій, які сервер успішно підтвердив.", -24, () => room(mix(mix(woodKnock(700, { dur: 0.6 }), bell(1318, 0.18), 0.01, 0.35), bell(1976, 0.2), 0.07, 0.28), 0.15, 0.3));
cue("ui-error", G.ui, "Відмова / не вистачає", "Два глухі стуки, без сирен.", -25, () => mix(woodKnock(250, { dur: 0.3, muffle: 1500 }), woodKnock(205, { muffle: 1300 }), 0.09, 0.85));
cue("nav-page", G.ui, "Нижня навігація — сторінка (синтез)", "Синтезоване перегортання: шелест паперу й тихий хлопок сторінки в кінці.", -27, () => {
  const d = 0.36;
  const swish = filter(noise(d, (t) => Math.sin(Math.PI * Math.min(1, t / 0.3)) ** 1.5), "bp", (t) => 1800 + 2600 * Math.sin(Math.PI * Math.min(1, t / 0.3)), 0.9);
  const crinkle = grains(d, 70, { lo: 2500, hi: 7000, amp: [0.15, 0.5], density: (p) => 1 - p * 0.7 });
  const flap = filter(noise(0.05, ar(0.002, 0.012)), "lp", 1400);
  return mix(mix(swish, crinkle, 0, 0.6), flap, 0.29, 1.4);
});
cue("nav-page-layered", G.ui, "Нижня навігація — сторінка (запис + синтез)", "Справжня сторінка OwlishMedia, укорочена, з синтезованим хлопком.", -27, () => mix(layer("book-page-alt.mp3", 0.32), filter(noise(0.05, ar(0.002, 0.012)), "lp", 1400), 0.24, 0.45), { layers: ["book-page-alt"] });

cue("card-flip", G.cards, "Карта перевертається (запис + синтез)", "Запис перевертання Splashdust з доданим клацанням краю карти й повітрям.", -23, () => {
  const out = mix(buf(0.45), whoosh(0.1, 1500, 4500, 2500, 1), 0, 0.35);
  mix(out, layer("card-flip.mp3", 0.35), 0.06, 1);
  return mix(out, slap(0.012, 3000), 0.06, 0.5);
}, { layers: ["card-flip"] });
cue("card-flip-synth", G.cards, "Карта перевертається (синтез)", "Повністю синтезований варіант: свист повітря і сухий клацок.", -23, () => {
  const out = mix(buf(0.25), whoosh(0.1, 1500, 5000, 2200, 1.1), 0, 0.6);
  mix(out, slap(0.01, 2800), 0.1, 1);
  return mix(out, thump(240, 170, 0.06, 0.02), 0.1, 0.35);
});
cue("card-place", G.cards, "Карта лягає на стіл", "Глухий шлепок карти на сукно.", -23, () => mix(mix(mix(buf(0.12), filter(noise(0.06, ar(0.001, 0.012)), "lp", 1300)), thump(170, 115, 0.08, 0.025), 0, 0.6), slap(0.01, 2200), 0, 0.3));
cue("pack-shake", G.cards, "Пак тремтить", "Шурхіт обгортки перед розривом — на стадію shake.", -23, () => {
  const out = buf(0.6);
  for (const [t, a] of [[0, 1], [0.13, 0.7], [0.3, 0.9], [0.43, 0.6]]) mix(out, mix(grains(0.12, 30, { lo: 2500, hi: 7000 }), filter(noise(0.1, ar(0.01, 0.03)), "bp", 2400, 0.8), 0, 0.5), t, a);
  return out;
});
cue("pack-tear", G.cards, "Розрив пака (запис + синтез)", "Справжній розрив паперу Luckius, підсилений хрускотом фольги.", -21, () => {
  const out = mix(buf(0.6), layer("paper-rip.mp3", 0.5), 0, 1);
  mix(out, grains(0.4, 140, { lo: 3000, hi: 9000, amp: [0.1, 0.5], density: (p) => 1 - p }), 0.02, 0.35);
  return mix(out, thump(200, 120, 0.06, 0.02), 0, 0.3);
}, { layers: ["paper-rip"] });
cue("reveal-common", G.cards, "Поява звичайної карти", "Легке мерехтіння дзвіночків.", -24, () => {
  const out = buf(0.9);
  ["E6", "G6", "A6", "C7", "D7"].forEach((n, k) => mix(out, bell(note(n), 0.16), k * 0.035 + rnd(0, 0.01), rnd(0.35, 0.6)));
  return room(mix(out, whoosh(0.3, 3000, 7000, 5000, 0.8), 0, 0.15), 0.25, 0.5);
});
cue("reveal-epic", G.cards, "Поява epic+ карти", "Наростання, низький удар і акорд дзвонів. Лише для рідкісних карт.", -21, () => {
  const out = buf(1.4);
  mix(out, filter(noise(0.5, (t) => (t / 0.5) ** 2), "bp", (t) => 400 + 3000 * (t / 0.5) ** 2, 1.2), 0, 0.6);
  mix(out, saturate(thump(170, 85, 0.6, 0.2), 1.8), 0.48, 0.8);
  ["A5", "C#6", "E6", "A6"].forEach((n, k) => mix(out, bell(note(n), 0.35), 0.5 + k * 0.025, 0.35));
  return room(out, 0.3, 0.8, 1.2);
});

cue("coin-single", G.coins, "Одна монета", "Дзвін монети з двома відскоками — для дрібних витрат і нагород.", -24, () => mix(mix(coinHit(3000), coinHit(3060, 0.45), 0.07), coinHit(2990, 0.2), 0.11));
cue("coins-reward", G.coins, "Жменя монет", "Каскад монет і м’який удар гаманця — для великих нагород.", -21, () => {
  const out = buf(1.1);
  for (let k = 0; k < 13; k += 1) mix(out, coinHit(rnd(2400, 3500), rnd(0.3, 0.9)), 0.03 + 0.5 * (k / 13) ** 1.4 + rnd(0, 0.02));
  return room(mix(out, filter(noise(0.15, ar(0.004, 0.04)), "lp", 700), 0.55, 0.8), 0.12, 0.3);
});
cue("reward-claim", G.coins, "Отримати нагороду", "Короткий підйом дзвіночків + монета. Daily login, завдання.", -21, () => {
  const out = buf(1);
  ["D6", "F#6", "A6", "D7"].forEach((n, k) => mix(out, bell(note(n), 0.22), k * 0.065, 0.45));
  return room(mix(out, coinHit(3200, 0.7), 0.2), 0.2, 0.5);
});

cue("battle-fly", G.battle, "Політ карти", "Свист повітря з легким тремтінням карти. Починається з реальним польотом.", -22, () => envelope(whoosh(0.34, 500, 2300, 900, 1.4), (t) => 1 + 0.25 * Math.sin(2 * Math.PI * 34 * t)));
cue("hit-weak", G.battle, "Удар — слабкий", "Легкий шлепок картою.", -20, () => mix(mix(buf(0.12), slap(0.03, 1500)), thump(170, 120, 0.09, 0.03), 0, 0.6));
cue("hit-normal", G.battle, "Удар — звичайний (запис + синтез)", "Запис удару OwlishMedia + низький поштовх і шлепок карти.", -17, () => {
  const out = mix(buf(0.35), layer("physical-hit.mp3", 0.3), 0, 0.9);
  mix(out, saturate(thump(160, 85, 0.25, 0.07), 1.8), 0, 0.8);
  return mix(out, slap(0.025, 1800), 0, 0.5);
}, { layers: ["physical-hit"] });
cue("hit-strong", G.battle, "Удар — сильний", "Важкий поштовх, тріск і осипання — для ×1.5 і більше.", -14, () => {
  const out = buf(0.7);
  mix(out, saturate(thump(170, 75, 0.5, 0.15), 2.5), 0, 1);
  mix(out, filter(noise(0.04, ar(0.0008, 0.01)), "bp", 1800, 0.6), 0, 0.9);
  mix(out, layer("physical-hit.mp3", 0.3), 0, 0.6);
  mix(out, grains(0.4, 60, { lo: 800, hi: 3500, amp: [0.1, 0.4], density: (p) => 1 - p }), 0.05, 0.4);
  return room(out, 0.2, 0.4, 1.3);
}, { layers: ["physical-hit"] });

cue("element-fire", G.element, "Вогонь", "Спалах і тріск жаринок.", -22, () => mix(filter(noise(0.5, ar(0.03, 0.15)), "lp", (t) => 700 + 1500 * Math.exp(-t / 0.1), 0.9), grains(0.5, 45, { lo: 1500, hi: 5000, len: [0.001, 0.004], amp: [0.3, 1], density: (p) => 1 - p * 0.8 }), 0, 0.8));
cue("element-water", G.element, "Вода", "Сплеск і кілька бульбашок.", -22, () => {
  const out = filter(noise(0.25, ar(0.002, 0.05)), "bp", (t) => 2600 - 1800 * (t / 0.25), 0.9);
  for (let k = 0; k < 7; k += 1) { const f = rnd(450, 900); mix(out, tone(0.06, (t) => f * (1 + 6 * t), 0.018), rnd(0.04, 0.3), rnd(0.15, 0.4)); }
  return out;
});
cue("element-air", G.element, "Повітря", "Короткий свист розрізаного повітря.", -22, () => mix(whoosh(0.32, 900, 2800, 1400, 9), whoosh(0.32, 600, 1800, 900, 1), 0, 0.4));
cue("element-earth", G.element, "Земля", "Хрускіт каміння і глухий поштовх.", -22, () => mix(mix(filter(grains(0.35, 220, { lo: 400, hi: 2500, len: [0.003, 0.012], density: (p) => 1 - p }), "lp", 3000), saturate(thump(140, 80, 0.2, 0.06), 1.8), 0, 0.8), grains(0.2, 25, { lo: 1800, hi: 3500, len: [0.002, 0.005] }), 0.02, 0.5));

cue("battle-victory", G.result, "Перемога", "Коротка мелодія щипкової лютні, ~1.5 с.", -20, () => {
  const out = buf(1.7);
  [["D4", 0], ["F#4", 0.12], ["A4", 0.24], ["D5", 0.4]].forEach(([n, t], k) => mix(out, pluck(1.3, note(n), { damp: k === 3 ? 0.998 : 0.994 }), t, 0.7));
  return room(mix(out, bell(note("D6"), 0.4), 0.4, 0.22), 0.22, 0.6);
});
cue("battle-defeat", G.result, "Поразка", "Три тихі ноти вниз і закриття книги. Без трагічних фанфар.", -21, () => {
  const out = buf(1.6);
  [["A3", 0], ["F3", 0.24], ["D3", 0.52]].forEach(([n, t]) => mix(out, filter(pluck(1, note(n), { damp: 0.993, bright: 0.2 }), "lp", 1800), t, 0.8));
  return room(mix(out, mix(filter(noise(0.07, ar(0.002, 0.02)), "lp", 900), thump(130, 90, 0.1, 0.03), 0, 0.7), 1.0, 0.9), 0.2, 0.5);
});

cue("forge-strike", G.gear, "Кування — ковадло", "Удар молота: дзвінкий метал, поштовх і кілька іскор.", -19, () => {
  const out = modal(1.2, 820, [1, 2.31, 3.95, 5.41, 6.9], [1, 0.6, 0.45, 0.25, 0.15], [0.5, 0.32, 0.2, 0.13, 0.09], { attack: 0.0005 });
  mix(out, thump(140, 90, 0.12, 0.04), 0, 0.7);
  mix(out, filter(noise(0.005, ar(0.0003, 0.0015)), "hp", 3000), 0, 0.8);
  return room(mix(out, grains(0.5, 25, { lo: 4000, hi: 9000, len: [0.001, 0.003], density: (p) => 1 - p }), 0.03, 0.3), 0.15, 0.4);
});
cue("card-protect", G.gear, "Захист карти — печатка", "Подвійне клацання замка і тихий дзвін печатки.", -23, () => {
  const click = () => mix(filter(noise(0.003, ar(0.0002, 0.001)), "hp", 3000), filter(noise(0.025, ar(0.0005, 0.006)), "bp", 2500, 6), 0, 0.6);
  return room(mix(mix(mix(buf(0.7), click(), 0), click(), 0.07, 0.8), bell(1760, 0.18), 0.09, 0.25), 0.15, 0.3);
});
cue("equipment-equip", G.gear, "Одягнути спорядження", "Шурхіт шкіри й клацання металевої пряжки.", -23, () => mix(mix(buf(0.3), filter(noise(0.16, ar(0.03, 0.05)), "bp", 900, 0.7)), modal(0.15, 3100, [1, 1.7, 2.6], [1, 0.5, 0.3], [0.04, 0.025, 0.015], { attack: 0.0005 }), 0.12, 0.6));
cue("card-upgrade", G.gear, "Посилення / поглинання карти", "Висхідне арпеджіо дзвіночків із наростанням.", -20, () => {
  const out = buf(1.3);
  mix(out, filter(noise(0.6, (t) => (t / 0.6) ** 1.5 * (t < 0.6 ? 1 : 0)), "bp", (t) => 800 + 4000 * (t / 0.6), 1.5), 0, 0.3);
  ["C6", "D6", "E6", "G6", "A6", "C7"].forEach((n, k) => mix(out, bell(note(n), 0.2), k * 0.07, 0.4));
  return room(out, 0.25, 0.6);
});

// ---------- render ----------
function finish(raw, targetDb) {
  // Phone speakers reproduce almost nothing below ~100 Hz; sub energy would only eat headroom and skew the level match.
  const samples = filter(filter(raw, "hp", 100), "hp", 100);
  // Drop the inaudible tail (below -60 dB of the peak).
  const peak = samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  let end = samples.length;
  while (end > 1 && Math.abs(samples[end - 1]) < peak * 1e-3) end -= 1;
  const out = samples.slice(0, Math.max(end, at(0.03)));
  const fadeIn = at(0.001), fadeOut = Math.min(at(0.02), out.length >> 2);
  for (let i = 0; i < fadeIn; i += 1) out[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i += 1) out[out.length - 1 - i] *= i / fadeOut;
  // Loudest 50 ms window RMS -> category target, so taps, coins and hits sit in one planned mix.
  const w = at(0.05);
  let sum = 0, best = 0;
  for (let i = 0; i < out.length; i += 1) { sum += out[i] ** 2; if (i >= w) sum -= out[i - w] ** 2; best = Math.max(best, sum); }
  const rms = Math.sqrt(best / Math.min(w, out.length)) || 1e-6;
  const gain = db(targetDb) / rms;
  const ceiling = db(-1);
  return out.map((x) => ceiling * Math.tanh((x * gain) / ceiling));
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((x, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write("data", 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

function toMp3(samples, file) {
  const tmp = `${file}.wav`;
  writeFileSync(tmp, wav(samples));
  const result = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", tmp, "-codec:a", "libmp3lame", "-b:a", "128k", "-ac", "1", file]);
  rmSync(tmp);
  if (result.status !== 0) throw new Error(`mp3 export failed: ${result.stderr}`);
}

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const sourceOf = { "book-page-alt": "owlish", "card-flip": "splashdust", "paper-rip": "luckius-paper", "physical-hit": "owlish" };

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const rendered = [];
const demo = [];
for (const c of cues) {
  seed = [...c.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);
  const samples = finish(c.build(), c.target);
  const file = `audio/round-3/${c.id}.mp3`;
  toMp3(samples, join(REVIEW, file));
  demo.push(samples, new Float32Array(at(0.4)));
  rendered.push({
    id: c.id, group: c.group, title: c.title, description: c.description, file,
    sourceId: SYNTH,
    originalFile: c.layers.length ? `синтез + ${c.layers.map((l) => `${l}.mp3`).join(", ")}` : "процедурний синтез",
    layers: c.layers.map((l) => ({ file: `audio/round-2/${l}.mp3`, sourceId: sourceOf[l], sha256: sha256(join(RECORDINGS, `${l}.mp3`)) })),
    sha256: sha256(join(REVIEW, file)),
    duration: Number((samples.length / SR).toFixed(3)),
    targetLevelDb: c.target,
    suggestedGain: 1,
    originType: c.layers.length ? "Синтез + запис CC0" : "Процедурний синтез",
  });
  console.log(`${c.id.padEnd(18)} ${(samples.length / SR).toFixed(2)}s  target ${c.target} dB`);
}

const demoCues = ["ui-tap", "ui-back", "nav-page", "card-flip", "pack-shake", "pack-tear", "reveal-epic", "coins-reward", "battle-fly", "hit-normal", "element-fire", "hit-strong", "battle-victory"];
const demoSamples = [];
for (const id of demoCues) { const i = cues.findIndex((c) => c.id === id); demoSamples.push(demo[i * 2], demo[i * 2 + 1]); }
const total = demoSamples.reduce((n, s) => n + s.length, 0);
const joined = new Float32Array(total);
let offset = 0;
for (const s of demoSamples) { joined.set(s, offset); offset += s.length; }
toMp3(joined, join(REVIEW, "selection-demo-round-3.mp3"));

const round2 = JSON.parse(readFileSync(join(REVIEW, "manifest-round-2.json"), "utf8"));
const layerSources = round2.sources.filter((s) => Object.values(sourceOf).includes(s.id));
const data = {
  title: "Третій підбір: власний синтез і шари",
  heading: "Власні звуки.\nОдин стіл, одна книга.",
  intro: `${rendered.length} звуків, згенерованих кодом: модальний синтез дерева, металу й дзвонів, фільтрований шум, щипкові струни. Для паперу, карт і удару підмішано CC0-записи з другого підбору. Нейромережі не використовувались.`,
  date: "2026-11-02",
  status: "Новий підбір. У гру не підключено. Гучність запланована за групами, тому кнопки свідомо тихші за удари.",
  processing: "Генератор: tools/audio-synth/synth.mjs (детермінований, без залежностей, потрібен лише ffmpeg). Рівень: найгучніші 50 мс доведено до цілі групи (−27…−14 dBFS RMS), м’який лімітер −1 dBFS. MP3 mono 44.1 kHz / 128 kbps.",
  demoFile: "selection-demo-round-3.mp3",
  demoDuration: Number((total / SR).toFixed(1)),
  demoCueIds: demoCues,
  manifestFile: "manifest-round-3.json",
  sources: [
    { id: SYNTH, name: "Процедурний синтез Cardastika", author: "Cardastika — tools/audio-synth", url: "../../tools/audio-synth/synth.mjs", license: "Власний", originEvidence: "Згенеровано кодом DSP без AI-моделей; відтворюється повторним запуском генератора." },
    ...layerSources,
  ],
  cues: rendered,
};
writeFileSync(join(REVIEW, "manifest-round-3.json"), `${JSON.stringify(data, null, 2)}\n`);

// Embed into the review stand between markers so it works from file:// without fetch.
const indexPath = join(REVIEW, "index.html");
const html = readFileSync(indexPath, "utf8");
const block = `<script id="round3-data" type="application/json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
const marker = /<script id="round3-data" type="application\/json">[\s\S]*?<\/script>/;
if (!marker.test(html)) throw new Error("index.html has no round3-data block");
writeFileSync(indexPath, html.replace(marker, () => block));
console.log(`\n${rendered.length} cues, demo ${(total / SR).toFixed(1)} s`);
