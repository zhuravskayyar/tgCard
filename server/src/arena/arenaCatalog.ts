import type { ArenaCosmetic, ArenaShopItem } from "@cardastika/shared";

export const ARENA_COSMETICS: readonly ArenaCosmetic[] = Object.freeze([
  { id: "arena_avatar_gladiator_helm", type: "avatar", displayName: "Гладіаторський шолом", owned: false },
  { id: "arena_avatar_bronze_beast", type: "avatar", displayName: "Бронзовий звір", owned: false },
  { id: "arena_avatar_crystal_eye", type: "avatar", displayName: "Кришталеве око", owned: false },
  { id: "arena_avatar_storm_mask", type: "avatar", displayName: "Маска бурі", owned: false },
  { id: "arena_frame_bronze", type: "frame", displayName: "Бронзова арена", owned: false },
  { id: "arena_frame_silver", type: "frame", displayName: "Срібна арена", owned: false },
  { id: "arena_frame_crystal", type: "frame", displayName: "Кришталева арена", owned: false },
  { id: "arena_frame_champion", type: "frame", displayName: "Рамка чемпіона", owned: false },
  { id: "arena_cardback_sand", type: "card_back", displayName: "Пісок арени", owned: false },
  { id: "arena_cardback_iron_ring", type: "card_back", displayName: "Залізне кільце", owned: false },
  { id: "arena_cardback_storm_sigil", type: "card_back", displayName: "Печатка бурі", owned: false },
  { id: "arena_cardback_gladiator", type: "card_back", displayName: "Гладіаторська сорочка", owned: false },
  { id: "arena_title_contender", type: "title", displayName: "Претендент", owned: false },
  { id: "arena_title_gladiator", type: "title", displayName: "Гладіатор", owned: false },
  { id: "arena_title_arena_hunter", type: "title", displayName: "Мисливець арени", owned: false },
  { id: "arena_title_champion", type: "title", displayName: "Чемпіон арени", owned: false },
]);

export const ARENA_SHOP_ITEMS: readonly ArenaShopItem[] = Object.freeze([
  { id: "arena_shards_25", displayName: "25 загальних осколків", price: 20, quantity: 25, rewardType: "shards" },
  { id: "arena_shards_50", displayName: "50 загальних осколків", price: 35, quantity: 50, rewardType: "shards" },
  { id: "arena_shards_100", displayName: "100 загальних осколків", price: 65, quantity: 100, rewardType: "shards" },
  { id: "arena_shards_250", displayName: "250 загальних осколків", price: 150, quantity: 250, rewardType: "shards" },
  { id: "arena_random_card", displayName: "Випадкова карта", price: 250, rewardType: "card" },
  { id: "arena_equipment_common", displayName: "Звичайне спорядження", equipmentRarity: "common", price: 60, rewardType: "equipment" },
  { id: "arena_equipment_uncommon", displayName: "Незвичайне спорядження", equipmentRarity: "uncommon", price: 120, rewardType: "equipment" },
  { id: "arena_equipment_rare", displayName: "Рідкісне спорядження", equipmentRarity: "rare", price: 250, rewardType: "equipment" },
  { id: "arena_equipment_epic", displayName: "Епічне спорядження", equipmentRarity: "epic", price: 500, rewardType: "equipment" },
  { id: "arena_avatar", displayName: "Аватар арени", price: 400, rewardType: "cosmetic", cosmeticType: "avatar" },
  { id: "arena_frame", displayName: "Рамка арени", price: 800, rewardType: "cosmetic", cosmeticType: "frame" },
  { id: "arena_card_back", displayName: "Сорочка арени", price: 1_200, rewardType: "cosmetic", cosmeticType: "card_back" },
  { id: "arena_title", displayName: "Титул арени", price: 2_000, rewardType: "cosmetic", cosmeticType: "title" },
]);

export function getArenaShopItem(id: string) {
  return ARENA_SHOP_ITEMS.find((item) => item.id === id);
}

export function getArenaCosmetic(id: string) {
  return ARENA_COSMETICS.find((item) => item.id === id);
}
