import type { CardRarity, StoryTrialNavigationTarget, StoryTrialReward } from "@cardastika/shared";

export type CampaignMetric = "event" | "duel_gold" | "collection" | "deck_power" | "deck_rarity" | "duel_rating" | "arena_rating" | "level" | "daily_tasks" | "guild_xp" | "guild_contribution" | "collection_cards" | "save_profile" | "pending";
export interface LocationTrial {
  id: string;
  title: string;
  metric: CampaignMetric;
  target: number;
  param?: string;
  sincePrevious: boolean;
  available: boolean;
  navigation: StoryTrialNavigationTarget | null;
}
export interface CampaignLocation {
  id: string;
  number: number;
  name: string;
  giverName: string;
  giverCode: string;
  plea: string[];
  trials: LocationTrial[];
  trialReward: StoryTrialReward;
  boss: {
    name: string;
    portraitCode: string;
    deck: { code: string; power: number }[];
    hp: number;
    respawnHours: number;
    firstWin: StoryTrialReward;
    drop: { rarity: CardRarity; level: number };
    thanks: string[];
  };
}

function trial(id: string, title: string, metric: CampaignMetric, target: number, navigation: StoryTrialNavigationTarget | null, param?: string, sincePrevious = false): LocationTrial {
  return { id, title, metric, target, navigation, param, sincePrevious, available: metric !== "pending" };
}
const t = trial;
// The reference keeps enemy card faces hidden. This valid catalog deck supplies the
// element balance while each location keeps its exact reference powers.
const codes = ["wind_fairy", "black_raven", "salamander", "impetuous_lizard", "carefree_hobbit", "mountain_eagle", "fire_ifrit", "river_naiad", "elvish_scout"];
function location(number: number, name: string, giverName: string, giverCode: string, plea: string[], trials: LocationTrial[], bossName: string, portraitCode: string, respawnHours: number, silver: number, rarity: CardRarity, level: number, powers: number[], thanks: string[]): CampaignLocation {
  const deck = powers.map((power, index) => ({ code: codes[index]!, power }));
  return {
    id: `location_${number}`, number, name, giverName, giverCode, plea, trials,
    trialReward: { gold: number, silver: number * 100 },
    boss: { name: bossName, portraitCode, hp: deck.reduce((sum, card) => sum + card.power, 0), respawnHours, firstWin: { gold: number * 10, silver }, drop: { rarity, level }, deck, thanks },
  };
}

export const CAMPAIGN_LOCATIONS: readonly CampaignLocation[] = [
  location(1, "Печери гоблінів", "Лариска", "wind_fairy", ["Гобліни полонили мою сестру.", "Подолай їхнього ватажка й допоможи повернути її додому."], [
    t("first-duel-win", "Виграй першу дуель", "event", 1, "duel", "DUEL_WON"),
    t("play-duels", "Зіграй 10 дуелей", "event", 10, "duel", "DUEL_FINISHED"),
    t("buy-cards", "Купи 4 карти в магазині", "event", 4, "shop", "SHOP_CARD_PURCHASED"),
    t("upgrade-cards", "Покращ карти 3 рази", "event", 3, "deck", "CARD_LEVEL_UP"),
    t("save-profile", "Збережи ігровий профіль", "save_profile", 1, "save-profile"),
  ], "Гоблін Кривозуб", "goblin_bombist", 2, 2000, "rare", 14, [86,90,93,120,252,257,289,125,124], ["Сестра знову вільна!", "Дякую, що не залишив нас у біді."]),
  location(2, "Ущелина вітрів", "Орлина", "mountain_eagle", ["Стихійні духи захопили ущелину орлів.", "Приборкай буревій і поверни нам небо."], [
    t("l2-elementals", "Збери колекцію «Елементалі»", "collection", 1, "collections", "elementals"),
    t("l2-duel-wins", "Виграй 50 дуелей", "event", 50, "duel", "DUEL_WON"),
    t("l2-duel-gold", "Здобудь 10 золота в дуелях", "duel_gold", 10, "duel"),
    t("l2-epic-deck", "Збери 9 епічних карт у колоді", "deck_rarity", 9, "deck", "epic"),
    t("l2-daily-tasks", "Виконай 12 щоденних завдань", "daily_tasks", 12, "tasks"),
  ], "Буревій Безкрил", "sandstorm", 4, 5000, "epic", 20, [356,510,981,525,529,1002,529,546,994], ["Орли знову ширяють над ущелиною.", "Нехай вітер береже тебе в дорозі!"]),
  location(3, "Гора пращурів", "Рудана", "carefree_hobbit", ["Гномий король привласнив золото моїх предків.", "Поверни наш спадок із кам'яного трону."], [
    t("l3-power", "Досягни сили колоди 14 000", "deck_power", 14000, "deck"),
    t("l3-legendary", "Збери 9 легендарних карт у колоді", "deck_rarity", 9, "deck", "legendary"),
    t("l3-rating", "Досягни рейтингу дуелей 1 800", "duel_rating", 1800, "duel"),
    t("l3-drops", "Здобудь 20 карт у кампанії", "event", 20, null, "CAMPAIGN_CARD_DROP"),
  ], "Король Кремінь", "basaltor", 10, 10000, "legendary", 40, [976,1131,1575,1811,1859,2209,2235,2681,2859], ["Скарб пращурів повернувся додому.", "Твою відвагу пам'ятатимуть у наших піснях."]),
  location(4, "Озеро туманів", "Зорекрила", "black_raven", ["Озерні русалки пограбували моє гніздо.", "Зупини їхню володарку й поверни вкрадене."], [
    t("l4-wins", "Виграй 300 дуелей", "event", 300, "duel", "DUEL_WON"),
    t("l4-cards", "Отримай 400 карт", "event", 400, "shop", "CARD_ACQUIRED"),
    t("l4-power", "Досягни сили колоди 22 000", "deck_power", 22000, "deck"),
    t("l4-rating", "Досягни рейтингу дуелей 2 250", "duel_rating", 2250, "duel"),
    t("l4-gold", "Зароби 1 000 золота", "pending", 1000, null, "gold_earned"),
  ], "Княгиня Водокоса", "river_naiad", 20, 25000, "legendary", 53, [2228,2957,2432,2444,2534,2722,4550,2406,2728], ["Моє гніздо знову ціле.", "Дякую за допомогу, мандрівнику!"]),
  location(5, "Вежа громовика", "Вербиця", "forest_bride", ["Безумний маг повітря випалює наш ліс.", "Зупини його, доки ще шелестить останнє листя."], [
    t("l5-silver", "Зароби 500 000 срібла", "pending", 500000, null, "silver_earned"),
    t("l5-absorb", "Поглинь 1 000 карт", "event", 1000, "weak", "CARD_ABSORBED"),
    t("l5-rating", "Досягни рейтингу дуелей 2 850", "duel_rating", 2850, "duel"),
    t("l5-mythic", "Збери 9 міфічних карт у колоді", "deck_rarity", 9, "deck", "mythic"),
    t("l5-dragons", "Збери колекцію «Древні дракони»", "collection", 1, "collections", "dragons"),
  ], "Архімаг Громолист", "sorceress_air", 20, 50000, "mythic", 65, [3643,4059,3700,3940,3873,5860,5925,3494,6152], ["Вогонь згас, і ліс житиме.", "Кожне його дерево пам'ятатиме тебе."]),
  location(6, "Ороча засідка", "Листана", "elvish_scout", ["Орки тримають дріаду в полоні.", "Розбий їхню засідку й визволи берегиню лісу."], [
    t("l6-mythic", "Збери колекцію «Міфічні створіння»", "collection", 1, "collections", "mythic"),
    t("l6-power", "Досягни сили колоди 44 000", "deck_power", 44000, "deck"),
    t("l6-rating", "Досягни рейтингу дуелей 3 200", "duel_rating", 3200, "duel"),
    t("l6-level", "Досягни 60 рівня", "level", 60, "duel"),
    t("l6-spend-diamonds", "Витрать 500 діамантів", "pending", 500, null, "diamonds_spent"),
    t("l6-raids", "Здолай ще 20 рейдових чудовиськ", "pending", 20, null, "raid_monsters", true),
    t("l6-diamonds", "Зароби 2 000 діамантів", "pending", 2000, null, "diamonds_earned"),
  ], "Грум Чорнокіготь", "berserk_earth", 20, 100000, "mythic", 70, [5197,5460,4868,7098,5335,8626,8028,5955,5144], ["Дріада знову вільна.", "Стежки лісу завжди відкриті для тебе."]),
  location(7, "Безмовний вир", "Росава", "vodyanka", ["Гідра полює на моїх сестер.", "Занурся в безмовний вир і поклади край її полюванню."], [
    t("l7-level", "Досягни 70 рівня", "level", 70, "duel"),
    t("l7-guild-xp", "Принеси гільдії 100 млн досвіду", "guild_xp", 100000000, "guild"),
    t("l7-elements", "Внеси 100 000 елементів у карту гільдії", "guild_contribution", 100000, "guild", "card_elements"),
    t("l7-silver", "Зароби 7 млн срібла", "pending", 7000000, null, "silver_earned"),
    t("l7-gold", "Зароби 12 000 золота", "pending", 12000, null, "gold_earned"),
    t("l7-rating", "Досягни рейтингу дуелей 3 600", "duel_rating", 3600, "duel"),
    t("l7-dragons", "Збери колекцію «Рідкісні дракони»", "collection", 1, "collections", "dragons2"),
  ], "Гідра Тиховодна", "bloodthirsty_piranha", 20, 250000, "mythic", 75, [6005,8848,7218,6866,10519,8003,6097,7786,8888], ["Сестри знову можуть співати біля води.", "Ти повернув спокій нашим берегам."]),
  location(8, "Драконова твердиня", "Іскрина", "fire_lady", ["У твердині сховане яйце золотого дракона.", "Допоможи винести його з-під варти древнього змія."], [
    t("l8-gifts", "Подаруй 50 подарунків", "pending", 50, null, "gifts_sent"),
    t("l8-treasury", "Внеси 5 000 золота в казну гільдії", "guild_contribution", 5000, "guild", "gold"),
    t("l8-arena", "Досягни рейтингу арени 3 600", "arena_rating", 3600, "arena"),
    t("l8-rating", "Досягни рейтингу дуелей 3 900", "duel_rating", 3900, "duel"),
    t("l8-cup", "Виграй кубок міфічного турніру", "pending", 1, null, "mythic_cup"),
    t("l8-diamonds", "Зароби 10 000 діамантів", "pending", 10000, null, "diamonds_earned"),
    t("l8-wizards", "Збери колекцію «Вищі маги»", "collection", 1, "collections", "wizards"),
  ], "Златокрил Величний", "hinotori", 20, 500000, "mythic", 80, [9350,10060,9580,9058,9778,8085,10385,8508,10268], ["Яйце в безпеці!", "Одного дня з нього вилупиться наш новий союзник."]),
  location(9, "Гоблінська ливарня", "Мідниця", "goblin_grinder", ["Гобліни збудували машину, що перемелює все живе.", "Зруйнуй її, перш ніж запрацює велика піч."], [
    t("l9-level", "Досягни 90 рівня", "level", 90, "duel"),
    t("l9-rating", "Досягни рейтингу дуелей 4 300 після попередньої пригоди", "duel_rating", 4300, "duel", undefined, true),
    t("l9-chest", "Відкрий ще одну 15-ту скриню", "pending", 1, null, "chest_15", true),
    t("l9-master", "Виграй ще один турнір майстрів", "pending", 1, null, "master_tournament", true),
    t("l9-guild-arena", "Завдай ще 9 млн шкоди на арені гільдій", "pending", 9000000, null, "guild_arena_damage", true),
    t("l9-invasion", "Завдай ще 99 млн шкоди у вторгненні", "pending", 99000000, null, "invasion_damage", true),
    t("l9-witch", "Отримай одну карту колекції «Відьми»", "collection_cards", 1, "collections", "sorceresses"),
  ], "Гоблінський Костолам", "goblin_grinder", 20, 1000000, "mythic", 85, [10967,11579,12622,12180,10639,10929,10291,10096,12575], ["Машина нарешті стихла.", "Ти врятував усю долину від гоблінської печі."]),
  location(10, "Колюче нагір'я", "Кремена", "studded_wheel", ["Для шипастого колеса потрібна сила гірських тролів.", "Приборкай їхнього ватажка й заверши нашу подорож."], [
    t("l10-marathon", "Здобудь ще 300 діамантів у щотижневих марафонах", "pending", 300, null, "marathon_diamonds", true),
    t("l10-generals", "Збери колекцію «Генерали Урфіна»", "collection", 1, "collections", "ugenerals"),
    t("l10-witches", "Отримай дві карти колекції «Відьми»", "collection_cards", 2, "collections", "sorceresses"),
    t("l10-cup", "Здобудь кубок майстрів або медаль 1/4–1/8", "pending", 1, null, "master_award"),
    t("l10-rating", "Досягни рейтингу дуелей 4 400 після попередньої пригоди", "duel_rating", 4400, "duel", undefined, true),
    t("l10-invasion", "Здобудь ще 5 карт за шкоду у вторгненні", "pending", 5, null, "invasion_damage_cards", true),
    t("l10-solo", "Самотужки здолай усіх драконів рейду гільдії", "pending", 1, null, "solo_dragons"),
  ], "Троль Каменерев", "forest_trollala", 20, 2000000, "mythic", 90, [12723,13339,13933,13333,11920,12605,12738,12983,12531], ["Нагір'я схилилося перед твоєю силою.", "Усі десять пригод пройдено. Дякую за цю подорож!"]),
];

export function getCampaignLocation(number: number) {
  return CAMPAIGN_LOCATIONS.find((location) => location.number === number);
}
