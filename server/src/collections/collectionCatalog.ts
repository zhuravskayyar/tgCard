import type {
  CardDefinition,
  CardElement,
  CardRarity,
  CollectionModifier,
  CollectionSource,
} from "@cardastika/shared";

export interface CollectionDefinition {
  bonus: CollectionModifier;
  bonusLabel: string;
  cards: readonly CardDefinition[];
  code: string;
  coverArtKey: string | null;
  displayName: string;
  id: string;
  source: CollectionSource;
}

type CardSeed = readonly [displayName: string, element: CardElement, minRarity: CardRarity, description: string, artKey: string];

function collection(
  code: string,
  displayName: string,
  bonus: CollectionModifier,
  bonusLabel: string,
  cards: readonly CardSeed[],
): CollectionDefinition {
  const id = `collection_${code}`;
  return Object.freeze({
    id,
    code,
    displayName,
    source: "standard",
    coverArtKey: null,
    bonus: Object.freeze(bonus),
    bonusLabel,
    cards: Object.freeze(cards.map(([cardName, element, minRarity, description, artKey], index) => {
      const cardId = `${code}_${String(index + 1).padStart(2, "0")}`;
      return Object.freeze({
        id: cardId,
        code: cardId,
        displayName: cardName,
        description,
        artKey,
        element,
        collectionId: id,
        minRarity,
        shopEligible: true,
        source: "standard" as const,
      });
    })),
  });
}

// Art files live in card-art/new-cards under their art list ID; until then cards show a placeholder.
export const COLLECTIONS: readonly CollectionDefinition[] = Object.freeze([
  collection("borderlands", "Прикордоння", { type: "silver_reward_pct", value: 3, scope: "duel" }, "+3% срібла за дуелі", [
    ["Вовк", "earth", "common", "Істота стихії Земля.", "new-cards/predators_01"],
    ["Лис", "earth", "common", "Істота стихії Земля.", "new-cards/starter_02"],
    ["Ворон", "air", "common", "Істота стихії Повітря.", "new-cards/starter_06"],
    ["Сокіл", "air", "common", "Істота стихії Повітря.", "new-cards/starter_07"],
    ["Вугор", "water", "common", "Істота стихії Вода.", "new-cards/starter_04"],
    ["Саламандра", "fire", "common", "Істота стихії Вогонь.", "new-cards/starter_01"],
    ["Жук-бомбардир", "fire", "common", "Істота стихії Вогонь.", "new-cards/starter_03"],
    ["Факел", "fire", "common", "Артефакт стихії Вогонь.", "new-cards/v4_borderlands_08"],
    ["Рунний камінь", "earth", "uncommon", "Артефакт стихії Земля.", "new-cards/v5_borderlands_09"],
    ["Злива", "water", "common", "Явище стихії Вода.", "new-cards/v4_borderlands_10"],
  ]),
  collection("black_forest", "Чорний ліс", { type: "battle_damage_pct", value: 3, scope: "duel" }, "+3% шкоди карт у дуелях", [
    ["Ент", "earth", "epic", "Істота стихії Земля.", "new-cards/v4_black_forest_01"],
    ["Мантикора", "earth", "epic", "Істота стихії Земля.", "new-cards/v3_black_forest_02"],
    ["Тіньова рись", "earth", "uncommon", "Істота стихії Земля.", "new-cards/v3_black_forest_01"],
    ["Волпертінгер", "air", "uncommon", "Істота стихії Повітря.", "new-cards/elementals_08"],
    ["Пука", "earth", "uncommon", "Істота стихії Земля.", "new-cards/wild_spirits_08"],
    ["Чорна верба", "water", "uncommon", "Істота стихії Вода.", "new-cards/v3_black_forest_08"],
    ["Вогняна міль", "fire", "uncommon", "Істота стихії Вогонь.", "new-cards/v3_black_forest_05"],
    ["Тотем", "earth", "uncommon", "Артефакт стихії Земля.", "new-cards/v4_black_forest_08"],
    ["Ліхтар", "fire", "uncommon", "Артефакт стихії Вогонь.", "new-cards/v4_black_forest_09"],
    ["Туман", "water", "uncommon", "Явище стихії Вода.", "new-cards/v4_black_forest_10"],
  ]),
  collection("marsh", "Трясовина", { type: "absorption_efficiency_pct", value: 4, scope: "absorption" }, "+4% ефективності поглинання", [
    ["Гідра", "water", "legendary", "Істота стихії Вода.", "new-cards/monsters_01"],
    ["Баніп", "water", "rare", "Істота стихії Вода.", "new-cards/elementals_07"],
    ["Келпі", "water", "rare", "Істота стихії Вода.", "new-cards/elementals_02"],
    ["Анаконда", "water", "uncommon", "Істота стихії Вода.", "new-cards/swampborn_05"],
    ["П’явка", "water", "common", "Істота стихії Вода.", "new-cards/plague_alchemy_02"],
    ["Болотний дракон", "water", "epic", "Істота стихії Вода.", "new-cards/v3_dead_marsh_07"],
    ["Болотна черепаха", "earth", "uncommon", "Істота стихії Земля.", "new-cards/v5_marsh_07"],
    ["Казан", "water", "uncommon", "Артефакт стихії Вода.", "new-cards/v4_marsh_08"],
    ["Оберіг", "earth", "uncommon", "Артефакт стихії Земля.", "new-cards/v4_marsh_09"],
    ["Повінь", "water", "rare", "Явище стихії Вода.", "new-cards/v4_marsh_10"],
  ]),
  collection("ash", "Попіл", { type: "element_damage_pct", value: 4, element: "fire", scope: "arena" }, "+4% сили Вогню на арені", [
    ["Фенікс", "fire", "mythic", "Істота стихії Вогонь.", "new-cards/elementals_01"],
    ["Цербер", "fire", "epic", "Істота стихії Вогонь.", "new-cards/monsters_07"],
    ["Жарозмій", "fire", "rare", "Істота стихії Вогонь.", "new-cards/v3_ash_horde_07"],
    ["Лавовий черв", "fire", "rare", "Істота стихії Вогонь.", "new-cards/plague_alchemy_09"],
    ["Сірчаний скорпіон", "fire", "uncommon", "Істота стихії Вогонь.", "new-cards/plague_alchemy_08"],
    ["Магмовий лев", "fire", "rare", "Істота стихії Вогонь.", "new-cards/witches_01"],
    ["Пекельний бик", "fire", "rare", "Істота стихії Вогонь.", "new-cards/v5_ash_07"],
    ["Горн", "fire", "uncommon", "Артефакт стихії Вогонь.", "new-cards/v4_ash_08"],
    ["Жаровня", "fire", "uncommon", "Артефакт стихії Вогонь.", "new-cards/v5_ash_09"],
    ["Виверження", "fire", "epic", "Явище стихії Вогонь.", "new-cards/v4_ash_10"],
  ]),
  collection("abyss", "Безодня", { type: "element_damage_pct", value: 4, element: "water", scope: "arena" }, "+4% сили Води на арені", [
    ["Кракен", "water", "mythic", "Істота стихії Вода.", "new-cards/monsters_05"],
    ["Левіафан", "water", "legendary", "Істота стихії Вода.", "new-cards/monsters_06"],
    ["Мурена", "water", "common", "Істота стихії Вода.", "new-cards/deepborn_01"],
    ["Мегалодон", "water", "epic", "Істота стихії Вода.", "new-cards/giants_02"],
    ["Манта", "water", "uncommon", "Істота стихії Вода.", "new-cards/giants_09"],
    ["Абісальна медуза", "water", "rare", "Істота стихії Вода.", "new-cards/witches_02"],
    ["Морський дракон", "water", "epic", "Істота стихії Вода.", "new-cards/v3_sunken_kingdom_08"],
    ["Спіральна мушля", "water", "uncommon", "Артефакт стихії Вода.", "new-cards/v5_abyss_08"],
    ["Тризуб", "water", "rare", "Артефакт стихії Вода.", "new-cards/v4_abyss_09"],
    ["Вир", "water", "rare", "Явище стихії Вода.", "new-cards/v4_abyss_10"],
  ]),
  collection("storm", "Шторм", { type: "element_damage_pct", value: 4, element: "air", scope: "arena" }, "+4% сили Повітря на арені", [
    ["Громоптах", "air", "epic", "Істота стихії Повітря.", "new-cards/thunderborn_01"],
    ["Пегас", "air", "epic", "Істота стихії Повітря.", "new-cards/v5_storm_02"],
    ["Грифон", "air", "rare", "Істота стихії Повітря.", "new-cards/thunderborn_04"],
    ["Грозовий змій", "air", "rare", "Істота стихії Повітря.", "new-cards/witches_04"],
    ["Камайтачі", "air", "uncommon", "Істота стихії Повітря.", "new-cards/wild_spirits_03"],
    ["Амфіптер", "air", "epic", "Істота стихії Повітря.", "new-cards/dragons_03"],
    ["Штормовий скат", "air", "rare", "Істота стихії Повітря.", "new-cards/v3_storm_peaks_07"],
    ["Грозовий дзвін", "air", "uncommon", "Артефакт стихії Повітря.", "new-cards/v4_storm_08"],
    ["Жезл грому", "air", "rare", "Артефакт стихії Повітря.", "new-cards/v4_storm_09"],
    ["Буря", "air", "rare", "Явище стихії Повітря.", "new-cards/v4_storm_10"],
  ]),
  collection("ice", "Крига", { type: "battle_hp_pct", value: 3, scope: "duel" }, "+3% здоров’я в дуелях", [
    ["Крижана віверна", "water", "epic", "Істота стихії Вода.", "new-cards/v3_frozen_frontier_02"],
    ["Нарвал", "water", "rare", "Істота стихії Вода.", "new-cards/v5_ice_02"],
    ["Морж", "water", "common", "Істота стихії Вода.", "new-cards/v5_ice_03"],
    ["Сніжний грифон", "air", "rare", "Істота стихії Повітря.", "new-cards/v3_frozen_frontier_03"],
    ["Крижаний ведмідь", "water", "rare", "Істота стихії Вода.", "new-cards/v3_frozen_frontier_06"],
    ["Крижаний краб", "water", "uncommon", "Істота стихії Вода.", "new-cards/v5_ice_06"],
    ["Морозний павук", "water", "uncommon", "Істота стихії Вода.", "new-cards/v5_ice_07"],
    ["Кристал льоду", "water", "rare", "Артефакт стихії Вода.", "new-cards/v4_ice_08"],
    ["Льодова маска", "water", "uncommon", "Артефакт стихії Вода.", "new-cards/v5_ice_09"],
    ["Хуртовина", "air", "rare", "Явище стихії Повітря.", "new-cards/v4_ice_10"],
  ]),
  collection("stone_halls", "Кам’яні зали", { type: "element_damage_pct", value: 4, element: "earth", scope: "arena" }, "+4% сили Землі на арені", [
    ["Василіск", "earth", "epic", "Істота стихії Земля.", "new-cards/monsters_04"],
    ["Кам’яний голем", "earth", "rare", "Істота стихії Земля.", "new-cards/v3_stone_depths_03"],
    ["Тараск", "earth", "epic", "Істота стихії Земля.", "new-cards/elementals_04"],
    ["Кристальний жук", "earth", "uncommon", "Істота стихії Земля.", "new-cards/v3_stone_depths_04"],
    ["Панголін", "earth", "common", "Істота стихії Земля.", "new-cards/armored_02"],
    ["Обсидіановий дрейк", "fire", "epic", "Істота стихії Вогонь.", "new-cards/v3_stone_depths_05"],
    ["Печерна багатоніжка", "earth", "uncommon", "Істота стихії Земля.", "new-cards/v5_stone_halls_07"],
    ["Ідол", "earth", "uncommon", "Артефакт стихії Земля.", "new-cards/v4_stone_halls_08"],
    ["Рунна плита", "earth", "rare", "Артефакт стихії Земля.", "new-cards/v5_stone_halls_09"],
    ["Зсув", "earth", "rare", "Явище стихії Земля.", "new-cards/v4_stone_halls_10"],
  ]),
  collection("night", "Ніч", { type: "experience_reward_pct", value: 3, scope: "duel" }, "+3% досвіду за дуелі", [
    ["Баргест", "fire", "rare", "Істота стихії Вогонь.", "new-cards/wild_spirits_07"],
    ["Некомата", "earth", "uncommon", "Істота стихії Земля.", "new-cards/wild_spirits_02"],
    ["Місячний олень", "earth", "rare", "Істота стихії Земля.", "new-cards/v5_night_03"],
    ["Кажан", "air", "common", "Істота стихії Повітря.", "new-cards/v4_night_04"],
    ["Пугач", "air", "common", "Істота стихії Повітря.", "new-cards/v4_night_05"],
    ["Кошмарний кінь", "fire", "rare", "Істота стихії Вогонь.", "new-cards/v3_night_court_05"],
    ["Інугамі", "earth", "uncommon", "Істота стихії Земля.", "new-cards/wild_spirits_01"],
    ["Місячний камінь", "earth", "uncommon", "Артефакт стихії Земля.", "new-cards/v4_night_08"],
    ["Кадило", "air", "uncommon", "Артефакт стихії Повітря.", "new-cards/v5_night_09"],
    ["Затемнення", "air", "legendary", "Явище стихії Повітря.", "new-cards/v5_night_10"],
  ]),
  collection("ruins", "Руїни", { type: "battle_hp_pct", value: 4, scope: "campaign" }, "+4% здоров’я в кампанії", [
    ["Горгулья", "air", "rare", "Істота стихії Повітря.", "new-cards/v3_living_ruins_02"],
    ["Оживлена броня", "earth", "rare", "Істота стихії Земля.", "new-cards/v3_living_ruins_01"],
    ["Глиняний голем", "earth", "rare", "Істота стихії Земля.", "new-cards/v3_living_ruins_03"],
    ["Рунний павук", "earth", "rare", "Істота стихії Земля.", "new-cards/v3_living_ruins_04"],
    ["Сфінкс", "air", "epic", "Істота стихії Повітря.", "new-cards/v3_forgotten_gods_05"],
    ["Сталевий дракон", "air", "epic", "Істота стихії Повітря.", "new-cards/v3_iron_legion_07"],
    ["Химера", "fire", "epic", "Істота стихії Вогонь.", "new-cards/v5_ruins_07"],
    ["Саркофаг", "earth", "rare", "Артефакт стихії Земля.", "new-cards/v5_ruins_08"],
    ["Печатка", "earth", "uncommon", "Артефакт стихії Земля.", "new-cards/v4_ruins_09"],
    ["Землетрус", "earth", "epic", "Явище стихії Земля.", "new-cards/v4_ruins_10"],
  ]),
  collection("dragons", "Дракони", { type: "battle_damage_pct", value: 4, scope: "campaign" }, "+4% шкоди карт у кампанії", [
    ["Фафнір", "fire", "legendary", "Істота стихії Вогонь.", "new-cards/dragons_06"],
    ["Лун", "water", "epic", "Істота стихії Вода.", "new-cards/dragons_08"],
    ["Нідхегг", "earth", "mythic", "Істота стихії Земля.", "new-cards/dragons_05"],
    ["Зілант", "air", "epic", "Істота стихії Повітря.", "new-cards/dragons_09"],
    ["Уроборос", "earth", "mythic", "Істота стихії Земля.", "new-cards/dragons_07"],
    ["Ліндворм", "earth", "epic", "Істота стихії Земля.", "new-cards/dragons_04"],
    ["Вулканічний дракон", "fire", "epic", "Істота стихії Вогонь.", "new-cards/v3_dragon_blood_07"],
    ["Драконяче яйце", "fire", "legendary", "Артефакт стихії Вогонь.", "new-cards/v4_dragons_08"],
    ["Драконячий череп", "earth", "epic", "Артефакт стихії Земля.", "new-cards/v5_dragons_09"],
    ["Вогняний дощ", "fire", "epic", "Явище стихії Вогонь.", "new-cards/v4_dragons_10"],
  ]),
  collection("three_realms", "Три царства", { type: "silver_reward_pct", value: 5, scope: "duel" }, "+5% срібла за дуелі", [
    ["Кірін", "earth", "legendary", "Істота стихії Земля.", "new-cards/elementals_03"],
    ["Шиса", "earth", "rare", "Істота стихії Земля.", "new-cards/wild_spirits_06"],
    ["Анзу", "air", "epic", "Істота стихії Повітря.", "new-cards/thunderborn_07"],
    ["Симург", "air", "legendary", "Істота стихії Повітря.", "new-cards/thunderborn_03"],
    ["Орф", "earth", "rare", "Істота стихії Земля.", "new-cards/monsters_08"],
    ["Амфісбена", "earth", "rare", "Істота стихії Земля.", "new-cards/elementals_05"],
    ["Макара", "water", "epic", "Істота стихії Вода.", "new-cards/v5_three_realms_07"],
    ["Брама", "earth", "epic", "Артефакт стихії Земля.", "new-cards/v4_three_realms_08"],
    ["Астролябія", "air", "rare", "Артефакт стихії Повітря.", "new-cards/v5_three_realms_09"],
    ["Розлом", "earth", "epic", "Явище стихії Земля.", "new-cards/v4_three_realms_10"],
  ]),
  collection("alchemy", "Алхімія", { type: "absorption_efficiency_pct", value: 5, scope: "absorption" }, "+5% ефективності поглинання", [
    ["Щурячий Король", "earth", "rare", "Істота стихії Земля.", "new-cards/plague_alchemy_04"],
    ["Чумний скарабей", "earth", "uncommon", "Істота стихії Земля.", "new-cards/plague_alchemy_01"],
    ["Чумна міль", "air", "uncommon", "Істота стихії Повітря.", "new-cards/plague_alchemy_03"],
    ["Алхімічний слизень", "water", "uncommon", "Істота стихії Вода.", "new-cards/plague_alchemy_06"],
    ["Мандрагора", "earth", "rare", "Істота стихії Земля.", "new-cards/v4_alchemy_05"],
    ["Ртутний павук", "water", "rare", "Істота стихії Вода.", "new-cards/v4_alchemy_06"],
    ["Кислотний черв", "water", "uncommon", "Істота стихії Вода.", "new-cards/v3_alchemical_plague_08"],
    ["Реторта", "water", "uncommon", "Артефакт стихії Вода.", "new-cards/v5_alchemy_08"],
    ["Філософський камінь", "earth", "mythic", "Артефакт стихії Земля.", "new-cards/v4_alchemy_09"],
    ["Кислотний дощ", "water", "rare", "Явище стихії Вода.", "new-cards/v4_alchemy_10"],
  ]),
  collection("lost_world", "Загублений світ", { type: "battle_hp_pct", value: 5, scope: "duel" }, "+5% здоров’я в дуелях", [
    ["Мамонт", "earth", "rare", "Істота стихії Земля.", "new-cards/giants_01"],
    ["Смилодон", "earth", "rare", "Істота стихії Земля.", "new-cards/primeval_01"],
    ["Титанобоа", "water", "epic", "Істота стихії Вода.", "new-cards/giants_03"],
    ["Мозазавр", "water", "epic", "Істота стихії Вода.", "new-cards/giants_05"],
    ["Мегаланія", "earth", "rare", "Істота стихії Земля.", "new-cards/v4_lost_world_05"],
    ["Аргентавіс", "air", "rare", "Істота стихії Повітря.", "new-cards/primeval_04"],
    ["Дунклеостей", "water", "rare", "Істота стихії Вода.", "new-cards/v4_lost_world_07"],
    ["Бурштин", "earth", "uncommon", "Артефакт стихії Земля.", "new-cards/v4_lost_world_08"],
    ["Щелепа", "earth", "uncommon", "Артефакт стихії Земля.", "new-cards/v5_lost_world_09"],
    ["Метеорний дощ", "fire", "legendary", "Явище стихії Вогонь.", "new-cards/v4_lost_world_10"],
  ]),
  collection("wastes", "Пустка", { type: "experience_reward_pct", value: 5, scope: "duel" }, "+5% досвіду за дуелі", [
    ["Скорпіон", "earth", "common", "Істота стихії Земля.", "new-cards/v4_wastes_01"],
    ["Каракал", "earth", "common", "Істота стихії Земля.", "new-cards/v4_wastes_02"],
    ["Фенек", "earth", "common", "Істота стихії Земля.", "new-cards/v4_wastes_03"],
    ["Орикс", "earth", "uncommon", "Істота стихії Земля.", "new-cards/v5_wastes_04"],
    ["Піщаний черв", "earth", "rare", "Істота стихії Земля.", "new-cards/v4_wastes_05"],
    ["Сонячний лев", "fire", "rare", "Істота стихії Вогонь.", "new-cards/v3_celestial_kingdom_08"],
    ["Амміт", "earth", "epic", "Істота стихії Земля.", "new-cards/v5_wastes_07"],
    ["Сонячний диск", "fire", "rare", "Артефакт стихії Вогонь.", "new-cards/v4_wastes_08"],
    ["Скрижаль", "earth", "rare", "Артефакт стихії Земля.", "new-cards/v4_wastes_09"],
    ["Піщана буря", "air", "rare", "Явище стихії Повітря.", "new-cards/v4_wastes_10"],
  ]),
]);
export const COLLECTION_CARDS: readonly CardDefinition[] = Object.freeze(COLLECTIONS.flatMap(({ cards }) => cards));

export function validateCollectionCatalog() {
  const elementCounts: Record<CardElement, number> = {
    fire: 0,
    water: 0,
    air: 0,
    earth: 0,
  };

  for (const card of COLLECTION_CARDS) elementCounts[card.element] += 1;

  return {
    collectionCount: COLLECTIONS.length,
    cardCount: COLLECTION_CARDS.length,
    elementCounts,
  };
}

validateCollectionCatalog();
