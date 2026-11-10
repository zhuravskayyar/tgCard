// Round 4 of docs/audio-review: anime-style CC0 recordings from Freesound, trimmed and level-matched.
// Usage: node tools/audio-pick/round4.mjs <dir with Freesound HQ previews named <id>.mp3>   (needs ffmpeg)
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAW = process.argv[2];
if (!RAW) throw new Error("pass the folder with raw Freesound previews");
const REVIEW = "docs/audio-review";
const OUT = join(REVIEW, "audio/round-4");
const SR = 44100;
const at = (s) => Math.round(s * SR);
const db = (d) => 10 ** (d / 20);

// [fsId, user, title] — every one verified CC0 on its Freesound page (2026-11-10).
const FS = {
  19307: ["martian", "hi speed electronic whoosh 1"], 84322: ["Splashdust", "flipCard"], 145516: ["Zabuhailo", "bookChatterPages"],
  171672: ["Leszek_Szary", "failure 2"], 211624: ["qubodup", "Magic Wand Glitter"], 223343: ["jalastram", "1_Coins"],
  253168: ["suntemple", "SFX UI Button Click"], 262118: ["rokenjocu", "Kirkstall Rock Crumble"], 264047: ["Logicogonist", "anime gong 1"],
  270588: ["michorvath", "Anvil Hit 2"], 321083: ["BenjaminNelan", "Wooden Click"], 338260: ["PhilSavlem", "Money Bag"],
  342541: ["sgrowe", "Fast Paper Rip"], 344722: ["Scrampunk", "Dark Chords"], 351408: ["newagesoup", "GLEAM-GLOW-SFX-CHIME"],
  370791: ["Jofae", "Game Knocked Out"], 386129: ["ldezem", "Anvil - Hammer on 6mm steel"], 406084: ["deleted_user_4128231", "BubbleBeam"],
  413221: ["ihitokage", "Energy pass/swoosh"], 413224: ["ihitokage", "Energy impact 4"], 420676: ["SypherZent", "Spell Cast / Buff / High Tone"],
  420677: ["SypherZent", "Spell Cast / Buff / Deep Tone"], 432289: ["Ari_Glitch", "Magic Circle Long Ringing"], 442872: ["qubodup", "Fire Magic"],
  464839: ["Breviceps", "Anime Sound Effect - Piercing impact"], 471097: ["spycrah", "Knife/sword swing"], 505417: ["Daleonfire", "Punch"],
  511485: ["MLaudio", "cartoon_wink_magic_sparkle"], 512243: ["NeoSpica", "Rock Smash"], 542584: ["adr1911", "Magic Circle Shield"],
  543168: ["1skyland", "fliping a page in a book"], 547603: ["KaysonArgyle", "Coin Splash"], 563541: ["colorsCrimsonTears", "Fire - Rpg"],
  565700: ["ralph.whitehead", "Coin Bag Jangling Shake"], 570855: ["rafaelzimrp", "magicProjectile_impact"], 571581: ["el_boss", "Playing Card Slide Right"],
  580310: ["colorsCrimsonTears", "Fanfare 2 - Rpg"], 583079: ["Breviceps", "File Select (metallic wet, hollow)"], 591155: ["ultraaxvii", "Sword Contact (with swipe)"],
  607407: ["colorsCrimsonTears", "Fanfare 3 - Rpg"], 638697: ["CaptainYulef", "Card"], 638698: ["CaptainYulef", "Card Shuffle"],
  683101: ["florianreichelt", "quick woosh"], 706204: ["xkeril", "Nice anime sword hit"], 710163: ["omgitsjo", "Paper Rip 4"],
  717771: ["1bob", "victory chime"], 736912: ["jackosnb", "menu_click"], 739487: ["qubodup", "Fire Trap"],
  759840: ["NoisyRedFox", "ShiningRinging"], 791456: ["Sadiquecat", "Vertical water sweep 2"], 814044: ["qubodup", "Creation Magic Blast"],
  816376: ["harrisonlace", "DSGNStngr basic trailer boom impact"], 817550: ["SilverDubloons", "PickupCard04"], 822568: ["qubodup", "User Interface Elegant Wooden Confirmation"],
  873746: ["The_Elementus", "Low_Mid_End_Void_Energy_Blast_Punch_02"], 876167: ["Assetsmith", "Soft Magic Spell Cast Whoosh"], 877976: ["Qvantor", "Swish Swipe Short"],
  877978: ["Qvantor", "Whoosh Fast Pass-By"], 264981: ["renatalmar", "SFX Magic"], 848847: ["SkySpeira", "Mysterious Magical Bell Flourish"],
  856641: ["qubodup", "Cartoon Magic Transition"], 817466: ["qubodup", "Cliche Magic Spell Sound"], 457306: ["1urker", "anime"],
  735168: ["Irolan", "Item Pickup Chime"],
  683179: ["NearTheAtmoshphere", "Fireball"], 260555: ["LookIMadeAThing", "Basic Fire Whoosh 2"], 244926: ["hnhnh", "fire-whoosh"],
  539972: ["Za-Games", "Fire Burst Flash"], 186932: ["ReadeOnly", "fire_explosion"], 855838: ["Sadiquecat", "Whoosh - Plastic water pipe"],
  321489: ["dslrguide", "Water Swish"], 842165: ["AardsReal", "Water Splash Free"], 521950: ["Kastenfrosch", "Water Impact"],
  554595: ["jakubp.jp", "Stick Throw Into Water"], 60013: ["qubodup", "Whoosh"], 789840: ["FartCTO", "Whoosh Short"],
  59988: ["qubodup", "SWOSH-01"], 381853: ["sqeeeek", "wind_gust_short"], 60009: ["qubodup", "swosh-22"],
  877977: ["Qvantor", "Whoosh Deep Heavy"], 475135: ["bolkmar", "FX - Swoosh - Low Pitch"], 385938: ["Pól", "S020_Rock_Impact_Mono"],
  522099: ["magnuswaker", "Concrete SMASH 2"], 336725: ["Kubatko", "Inception Horn Victory"], 427803: ["DeVern", "Cinematic Hit With Horns"],
  391095: ["burlyegg", "Drop (dramatic strings)"], 348924: ["cabled_mess", "Glockenspiel_46_f4_04"], 692828: ["hollandm", "Woodblock-soft"],
  742356: ["NoisyRedFox", "SingleKnock_Wood"], 843548: ["kevinklang", "ROCK_IMPACT_GALETS_OUTDOORS"], 877981: ["Qvantor", "Whoosh Magic Sparkle"], 878238: ["Qvantor", "UI Click Wooden"],
};

// Target = loudest 50 ms RMS in dBFS, planned per group (same plan as round 3).
const GROUPS = {
  ui: ["Інтерфейс", -26], cards: ["Карти й сторінки", -23], rewards: ["Паки й нагороди", -21],
  fly: ["Бій — політ карти", -21], strike: ["Бій — удар стихії", -18], hit: ["Бій — удари", 0], element: ["Бій — шар стихії", -23], result: ["Бій — результат", -20],
};
const HIT_TARGET = { "hit-weak": -20, "hit-normal": -17, "hit-strong": -14 };

// cue, group, fsId, max seconds, title, description, [start seconds — otherwise auto from the first onset]
const C = [
  ["battle-fly", "fly", 413221, 0.6, "Енергетичний прохід", "Аніме-ривок енергії; щільний і короткий під новий політ.", 0],
  ["battle-fly", "fly", 19307, 0.42, "Швидкісний електро-свист", "Яскравий швидкий свист, як промінь-комета."],
  ["battle-fly", "fly", 683101, 0.55, "Швидкий свист", "Чистий повітряний свист без магії."],
  ["battle-fly", "fly", 877978, 0.7, "Пролітання повз", "Свист з наростанням і відльотом."],
  ["battle-fly", "fly", 876167, 0.8, "Каст закляття зі свистом", "Магічний шелест-заклинання: печать розкривається, карта зривається."],
  ["hit-weak", "hit", 706204, 0.7, "Аніме-удар мечем", "Світлий високий аніме-удар з дзвоном."],
  ["hit-weak", "hit", 591155, 0.7, "Контакт клинка", "Дзвінкий шар удару зі змахом."],
  ["hit-weak", "hit", 505417, 0.5, "Удар кулаком", "Сухий фізичний удар."],
  ["hit-normal", "hit", 464839, 0.8, "Аніме-проникнення", "Класичний аніме-удар-прокол, як у бойових сценах 2000-х."],
  ["hit-normal", "hit", 413224, 0.9, "Енергетичний удар", "Енергетичний вибух у дусі Fate: печать спалахує на цілі."],
  ["hit-normal", "hit", 570855, 0.8, "Влучання магічного снаряда", "Магічний снаряд об ціль."],
  ["hit-strong", "hit", 873746, 0.9, "Удар порожнечі", "Важкий енергетичний удар-панч із басом."],
  ["hit-strong", "hit", 816376, 1.2, "Трейлерний бум", "Кінематографічний бум із хвостом."],
  ["hit-strong", "hit", 814044, 1.2, "Вибух магії творіння", "Великий магічний вибух зі світлом."],
  ["hit-strong", "hit", 264047, 1.2, "Аніме-гонг", "Драматичний дзвін-гонг, як ключовий удар в аніме."],
  ["element-fire", "element", 442872, 0.8, "Вогняна магія", "Коротке полум'я."],
  ["element-fire", "element", 563541, 0.8, "Вогонь RPG", "Спалах вогню."],
  ["element-fire", "element", 739487, 0.8, "Вогняна пастка", "Різкий вибух полум'я."],
  ["element-water", "element", 791456, 0.8, "Водяний змах", "Вертикальна хвиля води."],
  ["element-water", "element", 406084, 0.8, "Бульбашковий промінь", "Мультяшна вода, бульбашки."],
  ["element-air", "element", 877976, 0.6, "Короткий змах", "Різкий порив повітря."],
  ["element-air", "element", 471097, 0.6, "Змах клинка", "Повітря, розсічене клинком.", 0],
  ["element-earth", "element", 512243, 0.7, "Розбитий камінь", "Камінь тріскає й розлітається.", 0.33],
  ["element-earth", "element", 262118, 0.8, "Осип каменю", "Сухий кам'яний обвал."],
  ["seal-open", "element", 432289, 0.9, "Магічне коло — дзвін", "Кандидат для майбутнього звуку печаті на замаху."],
  ["seal-open", "element", 542584, 0.9, "Магічне коло-щит", "Гудіння й дзвін кола; кандидат для печаті."],
  ["seal-open", "element", 420676, 0.9, "Каст / баф, високий", "Світлий магічний дзвін."],
  ["seal-open", "element", 420677, 0.8, "Каст / баф, глибокий", "Глибший магічний імпульс."],
  ["card-flip", "cards", 84322, 0.4, "Переворот карти (Splashdust)", "Карта перевертається на столі."],
  ["card-flip", "cards", 638697, 0.4, "Карта", "Ляскіт карти."],
  ["card-flip", "cards", 817550, 0.3, "Підхопити карту", "Короткий шурхіт."],
  ["card-flip", "cards", 571581, 0.3, "Ковзання карти", "Карта ковзає по столу."],
  ["nav-page", "cards", 543168, 0.5, "Сторінка книги", "Перегортання сторінки."],
  ["nav-page", "cards", 145516, 0.5, "Шелест сторінок", "Швидкий шелест."],
  ["ui-tap", "ui", 878238, 0.22, "Дерев'яний клік", "Сухий дерев'яний клік."],
  ["ui-tap", "ui", 321083, 0.15, "Дерев'яне клацання", "Дуже короткий клік."],
  ["ui-tap", "ui", 253168, 0.18, "Кнопка UI", "Чистий ігровий клік."],
  ["ui-tap", "ui", 822568, 0.26, "Елегантне дерев'яне підтвердження", "Дерево з легким тоном."],
  ["ui-back", "ui", 583079, 0.33, "Порожнистий метал", "Глухий металевий клік."],
  ["ui-back", "ui", 736912, 0.18, "Клік меню", "Короткий клік меню."],
  ["pack-shake", "rewards", 638698, 1.0, "Тасування карт", "Пак тремтить, карти шарудять."],
  ["pack-shake", "rewards", 565700, 1.0, "Брязкіт мішечка", "Мішечок брязкає."],
  ["pack-tear", "rewards", 342541, 0.7, "Швидкий розрив паперу", "Різкий розрив обгортки."],
  ["pack-tear", "rewards", 710163, 0.4, "Розрив паперу", "Короткий розрив."],
  ["reveal-common", "rewards", 351408, 1.2, "Відблиск-дзвін", "Світлий дзвін появи карти."],
  ["reveal-common", "rewards", 511485, 1.0, "Мультяшне підморгування", "Аніме «кіра»-іскра."],
  ["reveal-common", "rewards", 759840, 0.65, "Сяйливий дзвін", "Короткий блиск."],
  ["reveal-epic", "rewards", 420676, 1.4, "Магічний баф", "Яскравий магічний підйом."],
  ["reveal-epic", "rewards", 211624, 1.6, "Мерехтіння чарівної палички", "Довгі іскри."],
  ["reveal-epic", "rewards", 264047, 1.6, "Аніме-гонг", "Драматичний дзвін рідкісної карти."],
  ["coins-reward", "rewards", 338260, 1.0, "Мішечок монет", "Монети в мішечку."],
  ["coins-reward", "rewards", 547603, 0.4, "Сплеск монет", "Короткий дзенькіт."],
  ["coins-reward", "rewards", 223343, 0.62, "Монети", "Кілька монет."],
  ["forge-strike", "rewards", 270588, 1.0, "Удар по ковадлу", "Чистий удар молота."],
  ["forge-strike", "rewards", 386129, 1.2, "Ковадло, 125 кг", "Важкий справжній удар по ковадлу."],
  ["battle-victory", "result", 580310, 1.9, "Фанфара RPG, коротка", "Коротка переможна фанфара."],
  ["battle-victory", "result", 607407, 2.4, "Фанфара RPG, довша", "Довша фанфара."],
  ["battle-victory", "result", 717771, 0.9, "Переможний дзвін", "Короткий дзвін перемоги."],
  ["battle-defeat", "result", 171672, 1.3, "Невдача", "Короткий спадний мотив."],
  ["battle-defeat", "result", 370791, 1.8, "Нокаут", "Ігровий нокаут."],
  ["battle-defeat", "result", 344722, 2.2, "Темні акорди", "Похмурий акорд."],
  ["card-absorb", "cards", 420677, 0.8, "Поглинання — глибокий імпульс", "Слабка карта розчиняється в основній."],
  ["card-absorb", "cards", 877981, 1.3, "Поглинання — магічний свист з іскрами", "Свист наростає й розсипається іскрами.", 0],
  ["card-absorb", "cards", 876167, 1.0, "Поглинання — м'який каст", "Тихий магічний шелест, без різкого удару."],
  ["card-absorb", "cards", 211624, 1.3, "Поглинання — іскри навиворіт", "Іскри чарівної палички задом наперед: сяйво втягується в карту.", 0.7, { reverse: true }],
  ["card-absorb", "cards", 542584, 1.2, "Поглинання — коло навиворіт", "Гул магічного кола задом наперед: енергія збирається й обривається.", 0.15, { reverse: true }],
  ["power-tick", "ui", 759840, 0.14, "Цифра сили долетіла", "Тихий дзвіночок на кожне +N; часто повторюється."],
  ["card-level-up", "rewards", 717771, 0.9, "Підвищення карти", "Світлий дзвін, коли сила дорахувалась."],
  ["pack-tear", "rewards", 342541, 0.7, "Розріз + аніме-дзинь", "Розрив обгортки з яскравим аніме-акцентом.", undefined, { layer: { id: 457306, at: 0, db: -3 } }],
  ["pack-tear", "rewards", 877976, 0.7, "Магічний змах + розрив", "Різкий змах-розріз, за ним папір.", undefined, { layer: { id: 342541, at: 0.08, db: -2 } }],
  ["pack-tear", "rewards", 264981, 1.0, "Магічний сплеск", "Яскравий магічний сплеск замість паперу."],
  ["reveal-common", "rewards", 856641, 1.2, "Мультяшний магічний перехід", "Казковий перелив, що виносить карту.", 0.35],
  ["reveal-common", "rewards", 735168, 1.0, "Дзвін знахідки", "Ігровий дзвін «отримав предмет»."],
  ["reveal-common", "rewards", 19307, 0.9, "Свист + кіра", "Карта вилітає зі свистом і спалахує аніме-іскрою.", undefined, { layer: { id: 511485, at: 0.16, db: 4 } }],
  ["reveal-epic", "rewards", 848847, 1.6, "Магічний дзвоновий розлив", "Таємничий розлив дзвонів для рідкісної карти.", 0.3],
  ["reveal-epic", "rewards", 817466, 1.4, "Класичне закляття", "Наростання закляття з фінальним спалахом.", 0.55],
  ["reveal-epic", "rewards", 264047, 1.6, "Гонг + кіра", "Аніме-гонг з іскрою: рідкісна карта.", undefined, { layer: { id: 511485, at: 0.05, db: 6 } }],
  ["reward-claim", "rewards", 351408, 1.2, "Нагорода — відблиск-дзвін", "Дзвін сяйва при зарахуванні нагороди.", 2.0],
  ["reward-claim", "rewards", 211624, 1.0, "Нагорода — чарівні іскри", "Іскри чарівної палички.", 0.7],
  ["reward-claim", "rewards", 580310, 1.0, "Нагорода — початок фанфари", "Перший акорд фанфари."],
  // Recorded replacements for the chiptune / synth picks (victory, defeat, level-up chime, button tap).
  ["battle-victory", "result", 336725, 2.4, "Кінематографічний ріг перемоги", "Оркестровий ріг, епічний і короткий."],
  ["battle-victory", "result", 427803, 2.2, "Оркестровий удар із рогами", "Гучний оркестровий удар-стінгер."],
  ["battle-defeat", "result", 391095, 2.6, "Драматичні струнні", "Струнні з важким басовим падінням.", 3.0],
  ["card-level-up", "rewards", 348924, 1.2, "Глокеншпіль — справжній дзвін", "Запис справжнього глокеншпіля."],
  ["ui-tap", "ui", 692828, 0.3, "Дерев'яна коробочка — запис", "Записаний удар паличкою по дерев'яній коробочці."],
  ["ui-tap", "ui", 742356, 0.25, "Стук по дереву — запис", "Короткий записаний стук по дереву."],
  // Element duel set: the flight and the impact each sound like the attacking card's element.
  ["fly-fire", "fly", 260555, 0.55, "Вогонь — гул полум'я", "Полум'я з гулом зривається з карти."],
  ["fly-fire", "fly", 683179, 0.55, "Вогонь — вогняна куля", "Тріскуча вогняна куля."],
  ["fly-fire", "fly", 244926, 0.55, "Вогонь — шипіння вогню", "Шиплячий язик полум'я.", 0.3],
  ["fly-water", "fly", 855838, 0.45, "Вода — водяний свист", "Свист, ніби струмінь води."],
  ["fly-water", "fly", 321489, 0.5, "Вода — змах води", "Хвиля води розсікає повітря."],
  ["fly-water", "fly", 791456, 0.6, "Вода — вертикальна хвиля", "Водяний вал, що наростає."],
  ["fly-air", "fly", 60013, 0.45, "Повітря — класичний свист", "Чистий швидкий свист вітру."],
  ["fly-air", "fly", 789840, 0.55, "Повітря — порив", "Порив, що наростає й відлітає."],
  ["fly-air", "fly", 59988, 0.3, "Повітря — різкий свист", "Дуже короткий різкий свист."],
  ["fly-earth", "fly", 475135, 0.6, "Земля — низький замах", "Важкий низький замах."],
  ["fly-earth", "fly", 877977, 0.6, "Земля — глибокий гул", "Глибокий важкий гул, як брила в польоті.", 0.35],
  ["element-fire", "strike", 539972, 0.7, "Вогонь — спалах", "Різкий вогняний спалах."],
  ["element-fire", "strike", 186932, 0.9, "Вогонь — вибух", "Вогняний вибух із хвостом.", 1.85],
  ["element-fire", "strike", 442872, 0.8, "Вогонь — магічне полум'я (гучніше)", "Колишній шар, тепер як головний удар."],
  ["element-water", "strike", 554595, 0.5, "Вода — пірнання", "Щось різко входить у воду."],
  ["element-water", "strike", 521950, 0.8, "Вода — удар об воду", "Важкий удар об воду.", 0.6],
  ["element-water", "strike", 842165, 0.8, "Вода — сплеск", "Широкий сплеск.", 0.2],
  ["element-air", "strike", 381853, 0.7, "Повітря — порив вітру", "Короткий порив, що збиває з ніг.", 0.5],
  ["element-air", "strike", 60009, 0.45, "Повітря — розсічення", "Повітря розсікає ціль."],
  ["element-air", "strike", 877976, 0.6, "Повітря — змах (гучніше)", "Колишній шар, тепер як головний удар."],
  ["element-earth", "strike", 385938, 0.7, "Земля — удар каменю", "Камінь б'є в ціль."],
  ["element-earth", "strike", 522099, 0.9, "Земля — розтрощений камінь", "Брила розлітається на шматки."],
  ["element-earth", "strike", 843548, 0.6, "Земля — гальковий удар", "Каміння сиплеться від удару.", 0.75],
];

function decode(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg decode failed on ${file}: ${r.stderr}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
}

function highpass(x, f) {
  // Two-pole Butterworth high-pass (RBJ), run twice for a steeper 24 dB/oct slope.
  const w = (2 * Math.PI * f) / SR, cos = Math.cos(w), alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha, b0 = (1 + cos) / 2 / a0, b1 = -(1 + cos) / a0, b2 = b0, a1 = (-2 * cos) / a0, a2 = (1 - alpha) / a0;
  const out = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i += 1) { const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; out[i] = y; }
  return out;
}

function prepare(raw, maxSec, startSec, targetDb, { reverse = false } = {}) {
  let x = highpass(highpass(raw, 100), 100);
  const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  let start = startSec === undefined ? x.findIndex((v) => Math.abs(v) > peak * 0.05) : at(startSec);
  start = Math.max(0, start - at(0.004));
  x = x.slice(start, start + at(maxSec));
  let end = x.length;
  while (end > at(0.03) && Math.abs(x[end - 1]) < peak * 1e-3) end -= 1;
  x = x.slice(0, end);
  if (reverse) {
    // Fade the forward tail so the reversed clip swells in, then it ends on the original attack: energy drawn inward.
    const swell = Math.floor(x.length * 0.6);
    for (let i = 0; i < swell; i += 1) x[x.length - 1 - i] *= (i / swell) ** 2;
    x.reverse();
  }
  const fadeIn = at(0.003), fadeOut = Math.min(at(reverse ? 0.025 : maxSec > 0.5 ? 0.12 : 0.03), x.length >> 2);
  for (let i = 0; i < fadeIn; i += 1) x[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i += 1) x[x.length - 1 - i] *= (i / fadeOut) ** 2;
  const w = at(0.05);
  let sum = 0, best = 0;
  for (let i = 0; i < x.length; i += 1) { sum += x[i] ** 2; if (i >= w) sum -= x[i - w] ** 2; best = Math.max(best, sum); }
  const gain = db(targetDb) / (Math.sqrt(best / Math.min(w, x.length)) || 1e-6);
  const ceiling = db(-1);
  return x.map((v) => ceiling * Math.tanh((v * gain) / ceiling));
}

function toMp3(samples, file) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "s16le", "-ar", String(SR), "-ac", "1", "-i", "-", "-codec:a", "libmp3lame", "-b:a", "128k", file], { input: data });
  if (r.status !== 0) throw new Error(`mp3 export failed: ${r.stderr}`);
}

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const letters = {};
const cues = C.map(([cue, group, fsId, maxSec, title, description, startSec, options]) => {
  const n = (letters[cue] = (letters[cue] ?? 0) + 1);
  const id = `${cue}-${String.fromCharCode(96 + n)}`;
  const target = group === "hit" ? HIT_TARGET[cue] : GROUPS[group][1];
  const rawFile = join(RAW, `${fsId}.mp3`);
  let raw = decode(rawFile);
  const layer = options?.layer;
  if (layer) {
    // Second recording, from its own first onset, mixed in at `at` seconds of the main recording.
    const extra = decode(join(RAW, `${layer.id}.mp3`));
    const peak = extra.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
    const from = Math.max(0, extra.findIndex((v) => Math.abs(v) > peak * 0.05) - at(0.004));
    const offset = at(layer.at);
    const mixed = new Float32Array(Math.max(raw.length, offset + extra.length - from));
    mixed.set(raw);
    for (let i = from; i < extra.length; i += 1) mixed[offset + i - from] += extra[i] * db(layer.db);
    raw = mixed;
  }
  const samples = prepare(raw, maxSec, startSec, target, options);
  const file = `audio/round-4/${id}.mp3`;
  toMp3(samples, join(REVIEW, file));
  const [user, original] = FS[fsId];
  console.log(`${id.padEnd(20)} ${(samples.length / SR).toFixed(2)}s  ${target} dB  fs#${fsId}${layer ? ` + fs#${layer.id}` : ""}`);
  return {
    id, group: `${GROUPS[group][0]} · ${cue}`, title: `${String.fromCharCode(64 + n)}. ${title}`, description, file,
    gameCue: cue, sourceId: `fs-${user}`, originalFile: `${original} (Freesound #${fsId}, HQ preview)`,
    originalSha256: sha256(rawFile), sha256: sha256(join(REVIEW, file)),
    layers: layer ? [{ file: `${FS[layer.id][1]} (Freesound #${layer.id}, HQ preview)`, sourceId: `fs-${FS[layer.id][0]}`, sha256: sha256(join(RAW, `${layer.id}.mp3`)) }] : [],
    duration: Number((samples.length / SR).toFixed(3)), targetLevelDb: target, suggestedGain: 1, originType: "Запис / саунддизайн CC0",
  };
});

const users = [...new Set(C.flatMap((c) => [FS[c[2]][0], ...(c[7]?.layer ? [FS[c[7].layer.id][0]] : [])]))];
const data = {
  title: "Четвертий підбір: аніме-звук, CC0",
  heading: "Аніме-удар.\nПечать і комета.",
  intro: `${cues.length} варіантів для ${new Set(cues.map((c) => c.gameCue)).size} подій гри: аніме-удари, енергетичні свисти, дзвони печатей, папір і монети. Усі записи — CC0 з Freesound; у кожної події 2–5 варіантів (A, B, C…), оберіть по одному.`,
  date: "2026-11-10",
  status: "Кандидати для вибору. У гру не підключено. Гучність вирівняно за групами: кнопки тихші за удари.",
  processing: "tools/audio-pick/round4.mjs: обрізка від першого удару, зріз нижче 100 Гц, плавні краї, найгучніші 50 мс доведено до цілі групи (−26…−14 dBFS RMS), м’який лімітер −1 dBFS. MP3 mono 44.1 kHz / 128 kbps. Джерело — HQ-прев’ю Freesound (128 kbps).",
  demoFile: null,
  manifestFile: "manifest-round-4.json",
  sources: users.map((u) => ({
    id: `fs-${u}`, name: `Freesound — ${u}`, author: u, url: `https://freesound.org/people/${u}/`, license: "CC0-1.0",
    licenseFile: "licenses/round-4/freesound-cc0.md", originEvidence: "Ліцензію CC0 перевірено на сторінці кожного звуку 10.11.2026.",
  })),
  cues,
};
writeFileSync(join(REVIEW, "manifest-round-4.json"), `${JSON.stringify(data, null, 2)}\n`);

const indexPath = join(REVIEW, "index.html");
const html = readFileSync(indexPath, "utf8");
const block = `<script id="round4-data" type="application/json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
const marker = /<script id="round4-data" type="application\/json">[\s\S]*?<\/script>/;
if (!marker.test(html)) throw new Error("index.html has no round4-data block");
writeFileSync(indexPath, html.replace(marker, () => block));
console.log(`\n${cues.length} variants`);
