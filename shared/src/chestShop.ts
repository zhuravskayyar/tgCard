import type { CardRarity, PlayerCard } from "./card.js";
import type { PlayerSummary } from "./player.js";

export type ChestShopPrizeKind = "gold_small" | "gold_large" | "diamonds" | "equipment" | "card" | "source";

/** One prize the current chest can hold. */
export interface ChestShopPossiblePrize {
  kind: ChestShopPrizeKind;
  /** Gold or diamonds. */
  amount?: number;
  /** Card and magic source level. */
  level?: number;
  equipmentRarity?: CardRarity;
}

export interface ChestShopGrantedPrize extends ChestShopPossiblePrize {
  /** Card or magic source name, or the equipment item id. */
  name?: string;
  equipmentItemId?: string;
  /** The card or magic source the player got, to show it like a shop reward. */
  card?: PlayerCard;
  newDiscovery?: boolean;
  deckChanged?: boolean;
}

export interface ChestShopFeedEntry {
  playerName: string;
  chestNumber: number;
  kind: ChestShopPrizeKind;
  equipmentRarity?: CardRarity;
  openedAt: string;
}

export interface ChestShopView {
  /** "closed": nothing to do this week; "available": the weekly opening can be started; "open": chests can be bought. */
  status: "closed" | "available" | "open";
  openUntil: string | null;
  /** The next chest to open (1–15) while open. */
  chestNumber: number;
  chestCount: number;
  price: number;
  possiblePrizes: ChestShopPossiblePrize[];
  /** When the next weekly opening becomes available. */
  nextWeekAt: string;
  feed: ChestShopFeedEntry[];
  /** The player's own latest opened chest; lets a retry after a lost response show what was won. */
  lastOpening?: { chestNumber: number; prize: ChestShopGrantedPrize; openedAt: string };
}

export interface ChestShopOpenChestRequest {
  /** The chest the player saw; a mismatch is rejected so a retry never buys two. */
  chestNumber: number;
}

export interface ChestShopOpenChestResponse {
  prize: ChestShopGrantedPrize;
  chestNumber: number;
  player: Pick<PlayerSummary, "gold" | "silver">;
  shop: ChestShopView;
}
