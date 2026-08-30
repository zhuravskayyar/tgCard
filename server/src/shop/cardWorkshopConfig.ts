import type { CardRarity } from "@cardastika/shared";

export const CARD_CRAFT_COSTS: Readonly<Record<CardRarity, number>> = Object.freeze({
  common: 100,
  uncommon: 250,
  rare: 600,
  epic: 1_400,
  legendary: 3_000,
  mythic: 6_000,
});

export const CARD_WORKSHOP_ROTATION_HOURS = 24;

export const CARD_WORKSHOP_RARITY_SLOTS = Object.freeze([
  Object.freeze({ count: 1, rarity: "common" as const }),
  Object.freeze({ count: 1, rarity: "uncommon" as const }),
  Object.freeze({ count: 1, rarity: "rare" as const }),
  Object.freeze({ count: 1, rarity: "epic" as const }),
  Object.freeze({ count: 1, rarity: "legendary" as const }),
  Object.freeze({ count: 1, rarity: "mythic" as const }),
]);

export function getWorkshopRotation(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + CARD_WORKSHOP_ROTATION_HOURS * 60 * 60 * 1_000);
  return {
    dateKey: start.toISOString().slice(0, 10),
    endsAt: end,
  };
}

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function selectWorkshopCardIds(
  cards: readonly { id: string; rarity: CardRarity }[],
  dateKey: string,
) {
  const selected: string[] = [];
  const ordered = (rarity: CardRarity) => [...cards]
    .filter((card) => card.rarity === rarity)
    .sort((left, right) => stableHash(`${dateKey}:${left.id}`) - stableHash(`${dateKey}:${right.id}`) || left.id.localeCompare(right.id));

  for (const slot of CARD_WORKSHOP_RARITY_SLOTS) {
    selected.push(...ordered(slot.rarity).slice(0, slot.count).map((card) => card.id));
  }
  return selected;
}
