import type { BattlePassItemKind, BattlePassReward } from "@cardastika/shared";
import { CURRENCY_ICON_SOURCES } from "../../components/currencyIcons";

type IconKey = BattlePassReward["kind"] | BattlePassItemKind;

const ITEM_ART = "/assets/ui/battle-pass";
/** Magic items with their own icon in ITEM_ART (item-<kind>-v1.webp); a new kind falls back to the closed chest. */
const ITEMS_WITH_ART: ReadonlySet<BattlePassItemKind> = new Set([
  "chest_discount", "dragon_heart", "element_tincture", "fourth_key", "gold_legacy", "hunting_permit",
  "magic_crystal", "magic_shovel", "master_charter", "miracle_heal", "shuffle", "stone_skin",
]);
const ITEM_FALLBACK = "/assets/ui/chest/chest-closed-icon.webp";

const REWARD_ICONS: Record<BattlePassReward["kind"], string> = {
  boost: "/assets/ui/shop/boosts/boost-banker-1h.png",
  card: "/assets/ui/icons/icon-card-reward-v1.webp",
  equipment: "/assets/ui/icons/slot-weapon-v1.webp",
  gold: CURRENCY_ICON_SOURCES.gold,
  item: ITEM_FALLBACK,
  silver: CURRENCY_ICON_SOURCES.silver,
};

export function rewardIcon(key: IconKey) {
  if (key in REWARD_ICONS) return REWARD_ICONS[key as BattlePassReward["kind"]];
  const kind = key as BattlePassItemKind;
  return ITEMS_WITH_ART.has(kind) ? `${ITEM_ART}/item-${kind.replace(/_/g, "-")}-v1.webp` : ITEM_FALLBACK;
}
