const fs = require("fs");
const RAR = { c: "common", u: "uncommon", r: "rare", e: "epic", l: "legendary", m: "mythic" };
const ELEMENT = { f: "Вогонь", w: "Вода", a: "Повітря", e: "Земля" };

// Structure copied from the reference: code, our name, bonus logic, source, element/key list.
const COLLECTIONS = [
["sea_masters","Господарі глибин","+5% картам Води на турнірі","Магазин","w/deepsea_guard,w/submarine_warrior,w/killer_shark,w/cruel_medusa,w/south_swamp_hydra,w/south_sea_naga,w/northern_vyvern,w/ancient_leviathan,w/horrible_kraken"],
["horde","Жарова навала","+5% картам Вогню на турнірі","Магазин","f/goblin_jet,f/furious_orc,f/mountain_troll,f/orc_raider,f/giant_orc,f/goblin_bomber,f/orc_shaman,f/goblin_mortar,f/balrog"],
["sky_heroes","Варта над хмарами","+5% картам Повітря на турнірі","Магазин","a/wind_fairy,a/air_genie,a/sky_priestess,a/air_mage,a/sky_scout,a/sky_doorkeeper,a/beautiful_valkyrie,a/lightning_thrower,a/smashing_angel"],
["forest_dwellers","Хазяї пущі","+5% картам Землі на турнірі","Магазин","e/pack_leader,e/stone_golem,e/centaur_archer,e/forest_keeper,e/rogue_bear,e/battle_unicorn,e/wise_tauren,e/sabretoothed_tiger,e/tremors"],
["elementals","Чотири начала","+10% срібла в дуелях","Магазин","w/water_elemental,a/air_elemental,e/earth_elemental,f/fire_elemental"],
["highelem","Бойові начала","−30 хв перерви в дуелях","Магазин","a/air_genie,e/stone_golem,f/fire_ifrit,w/water_phantom"],
["boobs","Весняний цвіт","+10% гільдійського досвіду","Магазин","e/flower_fairy,a/wind_fairy,f/fire_ifrit,w/water_phantom,w/hungry_mermaid,f/red_harpy,a/sky_priestess,w/fruity_siren,w/river_naiad,a/beautiful_valkyrie,e/forest_dryad,f/fire_witch,a/smashing_angel,w/snow_queen,e/elvish_princess"],
["power","Старі вояки","+10% гільдійського досвіду","Магазин","e/carefree_hobbit,e/thickskinned_dwarf,e/elvish_scout,e/gloomy_wayfarer,a/sky_scout,e/wise_tauren,a/sky_doorkeeper,a/lightning_thrower,a/war_archangel"],
["dragons","Старі змії","+5 щоденного золота в дуелях","Магазин, рейди гільдії","f/fire_dragon,a/north_dragon,e/silver_dragon"],
["dragons2","Рідкісні змії","+10 щоденного золота в дуелях, щоденний внесок у скарбницю 5 → 10","Магазин, рейди гільдії","a/feathered_dragon,e/underground_dragon,f/black_dragon,w/sea_dragon"],
["mythic","Давні страхи","+10% до швидкості прокачки карт","Магазин","w/horrible_kraken,f/balrog,a/smashing_angel,e/tremors"],
["wizards","Чотири владики","+5% здоров'я на турнірі й у війнах гільдій","Магазин","a/war_archangel,e/elvish_princess,f/fire_titan,w/snow_queen"],
["umutants","Шулікові виродки","Пришвидшує золото в дуелях: близько 10% денного ліміту за перемогу","Навала Шуліки","a/flying_monkey,e/gloomy_rhino,f/furious_rat,w/merry_croco"],
["ugiants","Шулікові велетні","Посилення на турнірі ефективніше на 5%","Навала Шуліки","a/air_serpent,e/mamukrajua,f/eternal_phoenix,w/sage_basilisk"],
["ufavorites","Шулікові улюбленці","Додаткова спроба захопити ключ у війні гільдій","Навала Шуліки","a/north_witch,e/wood_mistress,f/fire_knight,w/lakes_princess"],
["usoldiers","Шулікова зграя","Щоденна безкоштовна покупка карти в магазині","Навала Шуліки","a/snow_warrior,e/sandstorm,f/drunk_cyclop,w/ancient_turtle,a/wild_wolf,e/forest_bride,f/el_minotauro,w/night_fury"],
["ugenerals","Шулікові ватажки","Гра додає 20% до вашого внеску золота й срібла в скарбницю","Навала Шуліки","a/heaven_mistress,e/shadow_heritress,f/black_widow,w/captain_daughter"],
["mechanists","Механічний двір","+5% картам і здоров'ю проти босів Навали","Магазин","a/icarus_disciple,e/studded_wheel,f/goblin_grinder,w/aquatank"],
["sorceresses","Чотири чаклунки","Посилення вівтаря за золото на 2 рівні вище","Рейди на чаклунок","a/sorceress_air,e/sorceress_earth,f/sorceress_fire,w/sorceress_water"],
["winter_reinforcement","Зимова рать","Усю зиму: святковий профіль, подарунки вдвічі дешевші, святкове оформлення в чаті й на форумі, сила карти зимового посилення +20%","Зимова акція","a/air_deer,a/air_frost,e/earth_quarrel,e/earth_tree,f/fire_sledge,w/water_snegurka,w/water_snowman"],
["dwarves_peace","Гноми на відпочинку","Удвічі менша шкода від «Прокляття чаклунок»; удвічі швидше копання скарбу в Печерах","Святковий магазин","a/dwarf_p_air,e/dwarf_p_earth,f/dwarf_p_fire,w/dwarf_p_water"],
["dwarves_war","Гноми на війні","+10% сили бойової колоди й здоров'я у битвах із чаклунками","Святковий магазин","a/dwarf_w_air,e/dwarf_w_earth,f/dwarf_w_fire,w/dwarf_w_water"],
["berserks","Скажена четвірка","Уміння «Сказ» у війнах гільдій: якщо три карти готові до атаки, усі карти на столі б'ють із силою ×2, відповідний удар не змінюється; раз за бій","Святковий магазин","a/berserk_air,e/berserk_earth,f/berserk_fire,w/berserk_water"],
["treasure_hunters","Шукачі скарбів","Удвічі більша денна норма алмазів на Навалі","Святковий магазин","a/flying_squirrel,e/forest_trollala,f/little_thunderstorm,w/night_cheat_girl"],
["dragon_whisperers","Приборкувачки змія","Подвоює шкоду «Полум'я дракона»","Святковий магазин","a/actress_shadow,e/blade_master,f/fire_lady,w/androida"],
["dragon_fans","Друзі дракона","Майстерність дракона +10","Святковий магазин","a/hinotori,e/cherepanda,f/goblin_bombist,w/vodyanka"],
["ancient_order","Старий заклик","У війні гільдій можна покликати Давню істоту замість трьох карт: вона б'є будь-яку карту критом, а у відповідь отримує половину шкоди; із Кристалом магії двічі за бій","Святковий магазин","a/ancient_order_air_f,a/ancient_order_air_m,f/ancient_order_fire_f,f/ancient_order_fire_m,w/ancient_order_water_f,w/ancient_order_water_m"],
["diamond_brotherhood","Алмазна артіль","Менше алмазів для 4-го кола Алмазних нагород, відкриває 5-те коло","Святковий магазин","a/diamond_brotherhood_air,e/diamond_brotherhood_earth,f/diamond_brotherhood_fire,w/diamond_brotherhood_water"],
["zodiac_air","Сузір'я вітру","На турнірі й у війні гільдій: 1 колекція сузір'їв +5% картам своєї стихії; 2 колекції +7,5%; 3 колекції +10%; усі 4 +10% картам усіх стихій і три артефакти на арені, турнірі та війні","Святковий магазин","a/zodiac_air_gemini,a/zodiac_air_libra,a/zodiac_air_aquarius"],
["zodiac_earth","Сузір'я ріллі","Як у «Сузір'я вітру», для Землі","Святковий магазин","e/zodiac_earth_taurus,e/zodiac_earth_virgo,e/zodiac_earth_capricorn"],
["zodiac_fire","Сузір'я вогнища","Як у «Сузір'я вітру», для Вогню","Святковий магазин","f/zodiac_fire_aries,f/zodiac_fire_leo,f/zodiac_fire_sagittarius"],
["zodiac_water","Сузір'я криниці","Як у «Сузір'я вітру», для Води","Святковий магазин","w/zodiac_water_cancer,w/zodiac_water_scorpio,w/zodiac_water_pisces"],
["voodoo_cult","Культ мотанки","Подвоює ефект артефакту «Лялька-мотанка»","Святковий магазин","a/lord_of_the_winds,e/shamans_daughter,f/don_juan,w/great_rivers_sorcerer"],
["sacred_shores","Золоті береги","Артефакт «Спис закляття» сильніший на 33%","Святковий магазин","a/nile_a_hor_ur,e/nile_e_scarab,f/nile_f_nadjem,w/nile_w_taweret"],
["great_path","Шовковий шлях","Артефакт «Щит-оберіг» сильніший на 33%","Святковий магазин","a/dao_a_white_tiger,e/dao_e_headless_giant,f/dao_f_werefox,w/dao_w_sea_doubletail"],
["thirtieth","За сімома горами","Артефакт «Чарівне люстро» сильніший на 33%","Святковий магазин","a/thirtieth_a_nightingale,e/thirtieth_e_baiyun,f/thirtieth_f_3headdragon,w/thirtieth_w_merman"],
["western_wastes","Дикі прерії","Артефакт «Лялька-мотанка» сильніший на 33%","Святковий магазин","a/west_a_thunderbird,e/west_e_sasquatch,f/west_f_fire_cow,w/west_w_underwater_panther"],
["gorgeous_cats","Розкішні коти","Артефакт «Оберіг життя» сильніший на 33%","Святковий магазин","a/dao_a_white_tiger,e/thirtieth_e_baiyun,f/nile_f_nadjem,w/west_w_underwater_panther"],
["choiceof_air","Вибір Вітру","Спорядження Повітря сильніше на 25%","Святковий магазин","a/nile_a_hor_ur,a/dao_a_white_tiger,a/thirtieth_a_nightingale,a/west_a_thunderbird"],
["choiceof_earth","Вибір Каменю","Спорядження Землі сильніше на 25%","Святковий магазин","e/nile_e_scarab,e/dao_e_headless_giant,e/thirtieth_e_baiyun,e/west_e_sasquatch"],
["choiceof_fire","Вибір Полум'я","Спорядження Вогню сильніше на 25%","Святковий магазин","f/nile_f_nadjem,f/dao_f_werefox,f/thirtieth_f_3headdragon,f/west_f_fire_cow"],
["choiceof_water","Вибір Течії","Спорядження Води сильніше на 25%","Святковий магазин","w/nile_w_taweret,w/dao_w_sea_doubletail,w/thirtieth_w_merman,w/west_w_underwater_panther"],
["legion_of_flame","Гарячий цех","Множники атакувального й відповідного критичного удару +0,1 за рівень колекції","Святковий магазин","f/incendium,w/maridel,e/geobot,a/vortex"],
["breath_of_storm","Штормовий цех","Множники атакувального й відповідного слабкого удару +0,1 за рівень колекції","Святковий магазин","f/incendium,w/tideflow,e/terraxis,a/stratos"],
["deep_engines","Глибинний цех","Множник атакувального звичайного удару +0,1 за рівень колекції","Святковий магазин","f/fleuro,w/maridel,e/stalaktion,a/aerum"],
["titans_of_forge","Ковальський цех","Множник відповідного звичайного удару +0,1 за рівень колекції","Святковий магазин","f/basaltor,w/dripstone,e/terraxis,a/aerum"],
["breach_wedge","Виламана брама","Артефакт «Алебарда» сильніший на 33%","Святковий магазин","a/wedge_storm_knight,e/wedge_strelets,f/wedge_brodex_valk,w/wedge_yarl"],
["mirror_fragments","Розбите люстро","Артефакт «Алебарда» сильніший на 33%","Святковий магазин","a/mirror_scaldmaer,e/mirror_teuton,f/mirror_inquisitor,w/mirror_tide_witch"],
["magic_1","Перші зміїні чари","Майстерність дракона +10","Святковий магазин","a/drmagic_air,e/drmagic_earth,f/drmagic_fire,w/drmagic_water"],
["magic_heal","Цілющі зміїні чари","Майстерність дракона +10","Святковий магазин","a/drmagic_heal_air,e/drmagic_heal_earth,f/drmagic_heal_fire,w/drmagic_heal_water"],
["twitch_legends","Легенди Twitch","Бонус колекції визначимо після її розширення","Магазин","e/kostakod"],
];
const UNCOLLECTED = "a/giant_dragonfly,f/salamander,w/crabman,a/black_raven,a/the_bat,e/wild_boar,f/goblin_mechanic,f/beholder,w/impetuous_lizard,w/bearded_toad,a/bronze_bird,a/mountain_eagle,w/bloodthirsty_piranha,a/battle_gryphon,f/fire_servant,a/winged_hound,a/el_air,e/el_earth,f/el_fire,w/el_water";

// Sizes the reference page reported, used to prove the copy is exact.
const REF_SIZES = {sea_masters:9,horde:9,sky_heroes:9,forest_dwellers:9,elementals:4,highelem:4,boobs:15,power:9,dragons:3,dragons2:4,mythic:4,wizards:4,umutants:4,ugiants:4,ufavorites:4,usoldiers:8,ugenerals:4,mechanists:4,sorceresses:4,winter_reinforcement:7,dwarves_peace:4,dwarves_war:4,berserks:4,treasure_hunters:4,dragon_whisperers:4,dragon_fans:4,ancient_order:6,diamond_brotherhood:4,zodiac_air:3,zodiac_earth:3,zodiac_fire:3,zodiac_water:3,voodoo_cult:4,sacred_shores:4,great_path:4,thirtieth:4,western_wastes:4,gorgeous_cats:4,choiceof_air:4,choiceof_earth:4,choiceof_fire:4,choiceof_water:4,legion_of_flame:4,breath_of_storm:4,deep_engines:4,titans_of_forge:4,breach_wedge:4,mirror_fragments:4,magic_1:4,magic_heal:4,twitch_legends:1};

const C = require("./catalog-cards.js");
const POOLS = require("./shop-pools.js");
const PROMPTS = require("./catalog-prompts.js");
const HAND_ANATOMY = "Anatomy priority for every human or humanoid: each hand has exactly five digits total, including one thumb and four fingers. A closed grip uses four naturally curled fingers and one opposing thumb. Preserve the expressive working pose and naturally connected shoulders, elbows, wrists, palms and fingers; do not add, omit, fuse or duplicate digits.";
const HAND_ANATOMY_BY_CARD = { kostakod: "This anthropomorphic raccoon's each front paw has exactly four digits total: one thumb-like digit and three fingers. Preserve natural grips and connected wrists, with no extra, missing, fused or duplicated digits." };
const STYLE = "Style: dark gothic tarot woodcut, like an old hand-carved medieval block print. Pure black ink only: heavy solid black shapes next to clean empty light areas, rough hand-cut contour lines, bold parallel hatching and crude cross-hatching, slightly grotesque character, large simple forms with few small details, no grey tones, no gradients, no airbrush. Light areas inside the subject are filled with flat warm cream paper colour, so the subject is opaque. Isolated subject on a fully transparent background, PNG with alpha, clean outer silhouette recognisable at 100 pixels, no card frame, no landscape unless named, no letters, no numbers, no text, no logo, no signature, no watermark. All human and humanoid characters are clearly adults. Every human or humanoid hand has exactly five digits in total: one thumb and four fingers, on both hands, including gloves and hands gripping objects. A visible closed grip has four curled fingers and one opposing thumb. Hands follow the character's action through natural grips, fists or meaningful gestures; preserve the expressive pose with natural five-digit anatomy. Use natural five-digit anatomy consistently while keeping shoulders, elbows, wrists and palms naturally connected, with no extra, missing, fused or duplicated limbs or digits. Women may be glamorous and alluring in bold fantasy outfits with bare shoulders, midriff and legs, without nudity.";
const compositionFor = (side) => `Square 1:1 canvas. Golden ratio composition: the main focal point (eyes or the most important detail) sits on the ${side === "L" ? "left" : "right"} vertical golden line at about ${side === "L" ? "38" : "62"}% of the width and the upper horizontal golden line at about 38% of the height. The body follows a golden spiral that sweeps down toward the lower left. Draw the subject smaller than you normally would, roughly centred, floating with generous empty transparent space on all four sides so that no part touches or is cut by any edge of the canvas. Pose the subject so its whole shape naturally tapers away from the lower right, leaving that corner as open background. Every form stays complete and organically drawn, with no straight cuts or stepped edges.`;
const promptOf = (key) => {
  const [side, subject] = PROMPTS[key].split("|");
  const anatomy = HAND_ANATOMY_BY_CARD[key] ?? HAND_ANATOMY;
  const style = key === "kostakod"
    ? STYLE.slice(0, STYLE.indexOf("All human and humanoid characters are clearly adults.")) + "All human and humanoid characters are clearly adults."
    : STYLE;
  return `${subject.charAt(0).toUpperCase()}${subject.slice(1)}. ${anatomy} ${compositionFor(side)} ${style}`;
};
const subjectOf = (key) => PROMPTS[key].split("|")[1];
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
const SHORT = { common: "c", uncommon: "u", rare: "r", epic: "e", legendary: "l", mythic: "m" };
// A card sold in the shop starts at the lowest rarity any banner sells it at; it cannot exist below that.
const shopMin = {};
for (const pool of Object.values(POOLS)) for (const [rarity, list] of Object.entries(pool)) for (const key of list.split(" ")) {
  if (!C[key]) throw new Error("pool card missing: " + key);
  if (!shopMin[key] || RARITY_ORDER.indexOf(rarity) < RARITY_ORDER.indexOf(shopMin[key])) shopMin[key] = rarity;
}
for (const [key, rarity] of Object.entries(shopMin)) C[key][1] = SHORT[rarity];

// Checks: exact sizes, every card has text, no duplicates in our names, element per reference.
const errors = [];
const useCount = {};
const cardEl = {};
for (const [code, , , , list] of COLLECTIONS) {
  const entries = list.split(",");
  if (REF_SIZES[code] !== entries.length) errors.push(`size ${code}`);
  for (const entry of entries) {
    const [el, key] = entry.split("/");
    if (!C[key]) errors.push(`missing ${key}`);
    if (cardEl[key] && cardEl[key] !== el) errors.push(`element ${key}`);
    cardEl[key] = el;
    useCount[key] = (useCount[key] || 0) + 1;
  }
}
UNCOLLECTED.split(",").forEach((entry) => { const [el, key] = entry.split("/"); if (!C[key]) errors.push(`missing ${key}`); cardEl[key] = el; });
const names = Object.values(C).map((v) => v[0]);
const dup = names.filter((n, i) => names.indexOf(n) !== i);
if (dup.length) errors.push("dup names: " + dup.join(", "));
const noPrompt = Object.keys(C).filter((k) => !PROMPTS[k]);
if (noPrompt.length) errors.push("no prompt: " + noPrompt.join(", "));
const extraPrompt = Object.keys(PROMPTS).filter((k) => !C[k]);
if (extraPrompt.length) errors.push("extra prompt: " + extraPrompt.join(", "));
if (Object.values(PROMPTS).some((v) => !/^[LR]\|.{20,}/.test(v))) errors.push("bad prompt format");
const unused = Object.keys(C).filter((k) => !cardEl[k]);
if (unused.length) errors.push("unused: " + unused.join(", "));
if (COLLECTIONS.length !== 51) errors.push("count");
const unique = Object.keys(useCount).length;
const shared = Object.values(useCount).filter((v) => v > 1).length;
if (unique !== 198 || shared !== 38) errors.push(`unique ${unique} shared ${shared}`);
const repo = process.argv[2];
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }

const nameOf = (k) => C[k][0];
const collectionsOf = {};
for (const [code, name, , , list] of COLLECTIONS) list.split(",").forEach((e) => { const k = e.split("/")[1]; (collectionsOf[k] ||= []).push(name); });
const rarityCount = {};
Object.values(C).forEach((v) => { rarityCount[RAR[v[1]]] = (rarityCount[RAR[v[1]]] || 0) + 1; });
const esc = (s) => s.replace(/\|/g, "\\|");

let md = `# Каталог карт v2 (чернетка для правок)

У каталозі збережені 50 колекцій референсу й додана наша колекція «Легенди Twitch», поки з однією картою. Для решти карт збережено розмір, спільний склад, бонуси й джерела. Типажі карт ті самі, що в референсі, зокрема люди й гуманоїди. Назви й описи свої, не дослівні. Стовпець «Сюжет арту» описує, що на арті; повні готові промпти зі стилем і композицією за золотим перетином лежать у \`docs/card-art-prompts.md\`.

- Колекцій: **51**; звичний розмір 3–15, «Легенди Twitch» поки має одну карту.
- Карт у колекціях: **198**, із них **38** входять у кілька колекцій.
- Карт поза колекціями: **${UNCOLLECTED.split(",").length}**, із них 4 «джерела» (el_*), див. docs/card-progression.md.
- Рідкість: ${Object.entries(rarityCount).map(([k, v]) => `${k} ${v}`).join(", ")}. Для карт із магазину вона взята з банерів референсу, для решти запропонована тут.

Код у дужках біля колекції та стовпець «Код референсу» потрібні лише для звірки і в гру не підуть.

`;
COLLECTIONS.forEach(([code, name, bonus, source, list], i) => {
  const entries = list.split(",");
  md += `## ${i + 1}. ${name} (\`${code}\`, карт: ${entries.length})\n\n**Бонус:** ${bonus}. **Джерело:** ${source}.\n\n| Карта | Стихія | Рідкість | Опис | Також у | Код референсу | Сюжет арту |\n|---|---|---|---|---|---|---|\n`;
  for (const e of entries) {
    const [el, k] = e.split("/");
    const also = collectionsOf[k].filter((n) => n !== name).join(", ");
    md += `| ${esc(nameOf(k))} | ${ELEMENT[el]} | ${RAR[C[k][1]]} | ${esc(C[k][2])} | ${also} | \`${k}\` | ${esc(subjectOf(k))} |\n`;
  }
  md += "\n";
});
md += `## Карти поза колекціями\n\n| Карта | Стихія | Рідкість | Опис | Код референсу | Сюжет арту |\n|---|---|---|---|---|---|\n`;
for (const e of UNCOLLECTED.split(",")) { const [el, k] = e.split("/"); md += `| ${esc(nameOf(k))} | ${ELEMENT[el]} | ${RAR[C[k][1]]} | ${esc(C[k][2])} | \`${k}\` | ${esc(subjectOf(k))} |\n`; }
md += `
## Власні назви механік

| Референс | Cardastika |
|---|---|
| Нашествие Урфина | Навала Шуліки |
| Рейды на колдуний | Рейди на чаклунок |
| Кукла Вуду | Лялька-мотанка |
| Копье мага | Спис закляття |
| Щит мага | Щит-оберіг |
| Зеркало магии | Чарівне люстро |
| Амулет жизни | Оберіг життя |
`;
const BANNERS = { card_legendary: "Легендарна карта, 150 золота", card_epic: "Епічна карта, 50 золота", card_uncommon: "Незвичайна карта, 500 срібла" };
md += "\n## Банери магазину\n\nКарта існує лише від тієї рідкості, з якої її продають. Склад банерів такий самий, як у референсі.\n";
for (const [offer, pool] of Object.entries(POOLS)) {
  md += `\n### ${BANNERS[offer]}\n\n`;
  for (const [rarity, list] of Object.entries(pool)) md += `- **${rarity}:** ${list.split(" ").map(nameOf).join(", ")}\n`;
}
fs.writeFileSync(repo + "/docs/card-catalog-v2.md", md, "utf8");
let promptsMd = `# Промпти артів карт

Готові промпти для генерації, по одному на карту. Файл збирає \`tools/card-catalog/build-catalog.js\`.

Сюжет кожної карти написаний після перегляду її спрайта в референсі: той самий типаж, поза й настрій, але свій дизайн. Стиль наш, а не референсу: похмура таро-ксилографія, чорна туш і кремова заливка на прозорому фоні. Шейдер сам тонує арт під матеріал рідкості, а силует незнайденої карти будується за контуром.

**Правила для кожного арту**

- Квадрат 1:1, прозорий фон (PNG з альфою), без рамки й тексту.
- Золотий перетин: головний акцент на лінії 38% або 62% ширини і 38% висоти, тіло йде золотою спіраллю вниз ліворуч.
- Нижній правий кут (25% ширини на 25% висоти) порожній, бо там стоїть медальйон стихії.
- Поле не менше 10% з кожного боку, нічого не обрізано.
- Сторона акценту чергується між картами, щоб колекція не виглядала однаково.
- Назву файлу й рядок у \`client/public/card-art/card-art-map.txt\` додавати за кодом картки: \`код | назва | код\`.

`;
for (const key of Object.keys(C).sort()) promptsMd += `## ${C[key][0]} (\`${key}\`)\n\n\`\`\`text\n${promptOf(key)}\n\`\`\`\n\n`;
fs.writeFileSync(repo + "/docs/card-art-prompts.md", promptsMd, "utf8");

// Game data. Bonuses that existing systems can apply are real; the rest wait for their mechanic and do nothing yet.
const CODE = { boobs: "spring_bloom", power: "old_soldiers" };
const WORKING = {
  elementals: { type: "silver_reward_pct", value: 10, scope: "duel" },
  highelem: { type: "duel_cooldown_minutes", value: 30, scope: "duel" },
  dragons: { type: "duel_gold_limit", value: 5, scope: "duel" },
  dragons2: { type: "duel_gold_limit", value: 10, scope: "duel" },
  umutants: { type: "duel_gold_share_pct", value: 10, scope: "duel" },
  mythic: { type: "absorption_efficiency_pct", value: 10, scope: "absorption" },
  sorceresses: { type: "altar_gold_levels", value: 2, scope: "altar" },
  dwarves_war: { type: "battle_damage_pct", value: 10, scope: "guild_raid" },
};
// Special labels for bonuses implemented elsewhere or still awaiting collection expansion.
const TOURNAMENT_LABELS = {
  sea_masters: true, horde: true, sky_heroes: true, forest_dwellers: true, ugiants: true,
  wizards: "+5% здоров'я на турнірі; у війнах гільдій — коли з’явиться ця механіка",
  twitch_legends: "Бонус колекції визначимо після її розширення",
  dragons2: "+10 щоденного золота в дуелях; ліміт внеску золота в скарбницю 5 → 10 на день",
  // Implemented by catalog code: equipment (game-core equipment.ts), guild XP (collectionModifiers.ts), witch curse (guildRaidService.ts),
  // free daily shop card (shopService.ts), treasury top-up (treasuryService.ts).
  choiceof_fire: true, choiceof_water: true, choiceof_earth: true, choiceof_air: true,
  boobs: true, power: true, usoldiers: true, ugenerals: true,
  dwarves_peace: "Удвічі менша шкода від «Прокляття чаклунок»; удвічі швидше копання скарбу в Печерах — коли з’явиться ця механіка",
};
const elementCode = { f: "fire", w: "water", a: "air", e: "earth" };
const toCard = (key) => ({ id: key, displayName: C[key][0], description: C[key][2], element: elementCode[cardEl[key]], minRarity: RAR[C[key][1]], shopEligible: Boolean(shopMin[key]) });
const data = {
  collections: COLLECTIONS.map(([code, name, bonus, , list]) => ({
    code: CODE[code] ?? code,
    displayName: name,
    bonus: WORKING[code] ?? { type: "none", value: 1 },
    bonusLabel: typeof TOURNAMENT_LABELS[code] === "string" ? TOURNAMENT_LABELS[code] : WORKING[code] || TOURNAMENT_LABELS[code] === true ? bonus : bonus + " (запрацює разом із цією механікою)",
    cardIds: list.split(",").map((entry) => entry.split("/")[1]),
  })),
  uncollectedCardIds: UNCOLLECTED.split(",").map((entry) => entry.split("/")[1]),
  cards: Object.keys(C).sort().map(toCard),
  shopPools: Object.fromEntries(Object.entries(POOLS).map(([offer, pool]) => [offer, Object.fromEntries(Object.entries(pool).map(([rarity, list]) => [rarity, list.split(" ")]))])),
};
fs.writeFileSync(repo + "/server/src/collections/catalogData.generated.ts", `// Generated by tools/card-catalog/build-catalog.js; edit the sources there.
import type { CardElement, CardRarity, CollectionModifier } from "@cardastika/shared";

export interface CatalogCardData {
  description: string;
  displayName: string;
  element: CardElement;
  id: string;
  minRarity: CardRarity;
  shopEligible: boolean;
}

export interface CatalogCollectionData {
  bonus: CollectionModifier;
  bonusLabel: string;
  cardIds: readonly string[];
  code: string;
  displayName: string;
}

export const CATALOG_DATA: {
  cards: readonly CatalogCardData[];
  collections: readonly CatalogCollectionData[];
  shopPools: Readonly<Record<string, Partial<Record<CardRarity, readonly string[]>>>>;
  uncollectedCardIds: readonly string[];
} = ${JSON.stringify(data, null, 1)};
`, "utf8");
console.log("ok", { collections: COLLECTIONS.length, unique, shared, uncollected: UNCOLLECTED.split(",").length, total: names.length, rarityCount });
