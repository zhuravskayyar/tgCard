import type {
  CardDefinition,
  CardElement,
  CardRarity,
  CollectionModifier,
} from "@cardastika/shared";

export interface CollectionDefinition {
  bonus: CollectionModifier;
  bonusLabel: string;
  cards: readonly CardDefinition[];
  code: string;
  coverArtKey: string | null;
  displayName: string;
  id: string;
}

type CardSeed = readonly [displayName: string, element: CardElement, minRarity: CardRarity];

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
    coverArtKey: null,
    bonus: Object.freeze(bonus),
    bonusLabel,
    cards: Object.freeze(cards.map(([cardName, element, minRarity], index) => Object.freeze({
      id: `${code}_${String(index + 1).padStart(2, "0")}`,
      code: `${code}_${String(index + 1).padStart(2, "0")}`,
      displayName: cardName,
      artKey: null,
      element,
      collectionId: id,
      minRarity,
      shopEligible: true,
    }))),
  });
}

export const COLLECTIONS: readonly CollectionDefinition[] = Object.freeze([
  collection("predators", "Хижаки", { type: "battle_damage_pct", value: 3 }, "+3% шкоди", [
    ["Вовк", "fire", "common"], ["Рись", "water", "common"],
    ["Росомаха", "air", "uncommon"], ["Гієна", "earth", "uncommon"],
    ["Каракал", "fire", "rare"], ["Мангуст", "water", "epic"],
  ]),
  collection("armored", "Панцирні", { type: "battle_hp_pct", value: 3 }, "+3% здоров’я", [
    ["Броненосець", "air", "common"], ["Панголін", "earth", "common"],
    ["Мечохвіст", "fire", "uncommon"], ["Жук-олень", "water", "uncommon"],
    ["Краб-павук", "air", "rare"], ["Черепаха-алігатор", "earth", "epic"],
  ]),
  collection("nocturnal", "Нічні", { type: "silver_reward_pct", value: 3 }, "+3% срібла", [
    ["Пугач", "fire", "common"], ["Кажан", "water", "common"],
    ["Генета", "air", "uncommon"], ["Тасманійський диявол", "earth", "uncommon"],
    ["Фенек", "fire", "rare"], ["Ай-ай", "water", "epic"],
  ]),
  collection("stormwings", "Бурекрилі", { type: "experience_reward_pct", value: 3 }, "+3% досвіду", [
    ["Альбатрос", "air", "common"], ["Беркут", "earth", "common"],
    ["Кондор", "fire", "uncommon"], ["Сапсан", "water", "uncommon"],
    ["Фрегат", "air", "rare"], ["Буревісник", "earth", "epic"],
  ]),
  collection("deepborn", "Глибинники", { type: "element_damage_pct", value: 4, element: "water" }, "+4% шкоди Води", [
    ["Мурена", "fire", "common"], ["Риба-вудильник", "water", "uncommon"],
    ["Гігантський кальмар", "air", "uncommon"], ["Наутилус", "earth", "rare"],
    ["Кашалот", "fire", "rare"], ["Латимерія", "water", "epic"],
    ["Креветка-богомол", "air", "legendary"],
  ]),
  collection("swampborn", "Болотники", { type: "absorption_efficiency_pct", value: 4 }, "+4% ефективності поглинання", [
    ["Алігатор", "earth", "common"], ["Марабу", "fire", "uncommon"],
    ["Капібара", "water", "uncommon"], ["Піранья", "air", "rare"],
    ["Анаконда", "earth", "rare"], ["Жаба-бик", "fire", "epic"],
    ["Водяний скорпіон", "water", "legendary"],
  ]),
  collection("caveborn", "Печерники", { type: "battle_hp_pct", value: 4 }, "+4% здоров’я", [
    ["Олм", "air", "common"], ["Сліпак", "earth", "uncommon"],
    ["Печерний лев", "fire", "uncommon"], ["Сольпуга", "water", "rare"],
    ["Печерний скорпіон", "air", "rare"], ["Сліпа тетра", "earth", "epic"],
    ["Підковоніс", "fire", "legendary"],
  ]),
  collection("thunderborn", "Грозові", { type: "element_damage_pct", value: 4, element: "air" }, "+4% шкоди Повітря", [
    ["Громоптах", "water", "common"], ["Рух", "air", "uncommon"],
    ["Симург", "earth", "uncommon"], ["Грифон", "fire", "rare"],
    ["Пегас", "water", "rare"], ["Кецаль", "air", "epic"],
    ["Анзу", "earth", "legendary"],
  ]),
  collection("venomous", "Отруйні", { type: "battle_damage_pct", value: 5 }, "+5% шкоди", [
    ["Чорна мамба", "fire", "common"], ["Габонська гадюка", "water", "uncommon"],
    ["Тайпан", "air", "uncommon"], ["Сколопендра", "earth", "rare"],
    ["Тарантул", "fire", "rare"], ["Андроктонус", "water", "epic"],
    ["Дереволаз", "air", "epic"], ["Синьокільчастий восьминіг", "earth", "legendary"],
  ]),
  collection("horned", "Рогаті", { type: "battle_hp_pct", value: 5 }, "+5% здоров’я", [
    ["Муфлон", "fire", "common"], ["Бізон", "water", "uncommon"],
    ["Носоріг", "air", "uncommon"], ["Буйвол", "earth", "rare"],
    ["Козоріг", "fire", "rare"], ["Сайгак", "water", "epic"],
    ["Як", "air", "epic"], ["Жук-носоріг", "earth", "legendary"],
  ]),
  collection("primeval", "Первозвірі", { type: "silver_reward_pct", value: 5 }, "+5% срібла", [
    ["Смилодон", "fire", "common"], ["Мегатерій", "water", "uncommon"],
    ["Ентелодон", "air", "uncommon"], ["Аргентавіс", "earth", "rare"],
    ["Мегаланія", "fire", "rare"], ["Дунклеостей", "water", "epic"],
    ["Дейнотерій", "air", "epic"], ["Еласмотерій", "earth", "legendary"],
  ]),
  collection("elementals", "Стихійні", { type: "experience_reward_pct", value: 5 }, "+5% досвіду", [
    ["Фенікс", "fire", "common"], ["Келпі", "water", "uncommon"],
    ["Кірін", "air", "uncommon"], ["Тараск", "earth", "rare"],
    ["Амфісбена", "fire", "rare"], ["Кокатріс", "water", "epic"],
    ["Баніп", "air", "epic"], ["Волпертінгер", "earth", "legendary"],
  ]),
  collection("giants", "Велетні", { type: "battle_hp_pct", value: 6 }, "+6% здоров’я", [
    ["Мамонт", "fire", "uncommon"], ["Мегалодон", "water", "rare"],
    ["Титанобоа", "air", "rare"], ["Парацератерій", "earth", "epic"],
    ["Мозазавр", "fire", "epic"], ["Саркозух", "water", "legendary"],
    ["Аргентиносавр", "air", "legendary"], ["Меганевра", "earth", "mythic"],
    ["Гігантська манта", "fire", "mythic"],
  ]),
  collection("dragons", "Дракони", { type: "deck_power_pct", value: 6 }, "+6% сили колоди", [
    ["Віверна", "water", "uncommon"], ["Дрейк", "air", "rare"],
    ["Амфіптер", "earth", "rare"], ["Ліндворм", "fire", "epic"],
    ["Нідхегг", "water", "epic"], ["Фафнір", "air", "legendary"],
    ["Уроборос", "earth", "legendary"], ["Лун", "fire", "mythic"],
    ["Зілант", "water", "mythic"],
  ]),
  collection("wild_spirits", "Дикі духи", { type: "absorption_efficiency_pct", value: 6 }, "+6% ефективності поглинання", [
    ["Інугамі", "air", "uncommon"], ["Некомата", "earth", "rare"],
    ["Камайтачі", "fire", "rare"], ["Куда-гіцуне", "water", "epic"],
    ["Нуе", "air", "epic"], ["Шиса", "earth", "legendary"],
    ["Баргест", "fire", "legendary"], ["Пука", "water", "mythic"],
    ["Татцельвурм", "air", "mythic"],
  ]),
  collection("monsters", "Потвори", { type: "battle_damage_pct", value: 6 }, "+6% шкоди", [
    ["Гідра", "earth", "uncommon"], ["Химера", "fire", "rare"],
    ["Мантикора", "water", "rare"], ["Василіск", "air", "epic"],
    ["Кракен", "earth", "epic"], ["Левіафан", "fire", "legendary"],
    ["Цербер", "water", "legendary"], ["Орф", "air", "mythic"],
    ["Катоблепас", "earth", "mythic"],
  ]),
]);

export const COLLECTION_CARDS = Object.freeze(COLLECTIONS.flatMap(({ cards }) => cards));

export function validateCollectionCatalog() {
  const sizes = COLLECTIONS.map(({ cards }) => cards.length);
  const codes = new Set(COLLECTION_CARDS.map(({ code }) => code));
  const elementCounts = COLLECTION_CARDS.reduce<Record<CardElement, number>>((counts, card) => {
    counts[card.element] += 1;
    return counts;
  }, { fire: 0, water: 0, air: 0, earth: 0 });

  if (COLLECTIONS.length !== 16) throw new Error("Collection catalog must contain exactly 16 collections");
  if (COLLECTION_CARDS.length !== 120) throw new Error("Collection catalog must contain exactly 120 cards");
  if (codes.size !== COLLECTION_CARDS.length) throw new Error("Canonical collection card codes must be unique");
  if (sizes.join(",") !== "6,6,6,6,7,7,7,7,8,8,8,8,9,9,9,9") {
    throw new Error("Canonical collection sizes are invalid");
  }
  if (COLLECTION_CARDS.some(({ collectionId }) => !collectionId)) {
    throw new Error("Every collection card must belong to exactly one collection");
  }
  return { collectionCount: COLLECTIONS.length, cardCount: COLLECTION_CARDS.length, elementCounts };
}

validateCollectionCatalog();
