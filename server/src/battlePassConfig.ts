import type { BattlePassItemKind, BattlePassReward } from "@cardastika/shared";

export interface BattlePassCircleConfig {
  brotherhoodThresholds?: readonly number[];
  circle: number;
  requiresBrotherhood?: boolean;
  thresholds: readonly number[];
}

/**
 * Circles and thresholds of «Алмазні нагороди», copied from the reference manual (docs/reference-elem-battle-pass.md).
 * Circle 4 is cheaper and circle 5 opens only with the «Алмазна артіль» collection (code diamond_brotherhood).
 */
export const BATTLE_PASS_CIRCLES: readonly BattlePassCircleConfig[] = [
  { circle: 1, thresholds: [50, 100, 150, 200, 250, 300, 400] },
  { circle: 2, thresholds: [460, 520, 580, 640, 700, 760, 900] },
  { circle: 3, thresholds: [970, 1040, 1110, 1180, 1250, 1320, 1500] },
  { brotherhoodThresholds: [1580, 1660, 1740, 1820, 1900, 1980, 2200], circle: 4, thresholds: [1600, 1700, 1800, 1900, 2000, 2100, 2500] },
  { circle: 5, requiresBrotherhood: true, thresholds: [2300, 2400, 2500, 2600, 2700, 2800, 3200] },
];

export const BATTLE_PASS_BROTHERHOOD_COLLECTION = "diamond_brotherhood";
/** Reference shop: VIP of «Алмазні нагороди» costs 1 250 gold per season (docs/reference-elem-loops-analysis.md). */
export const BATTLE_PASS_VIP_PRICE_GOLD = 1_250;
/** Reference: a second item of the same kind is swapped for 100 gold. */
export const BATTLE_PASS_DUPLICATE_ITEM_GOLD = 100;

const boost = (multiplier: 2 | 3 | 4): BattlePassReward => ({ durationHours: 24, kind: "boost", label: `×${multiplier} срібла та золота · 24 години`, multiplier });
const silver = (amount: number, label: string): BattlePassReward => ({ amount, kind: "silver", label });
const gold = (amount: number): BattlePassReward => ({ amount, kind: "gold", label: `${amount} золота` });
const card: BattlePassReward = { kind: "card", label: "Випадкова карта", levelSource: "lowest_deck" };
const equipment = (rarity: "uncommon" | "rare" | "epic", label: string): BattlePassReward => ({ kind: "equipment", label, rarity });

/** Our own names for the reference magic items. */
export const BATTLE_PASS_ITEM_LABELS: Record<BattlePassItemKind, string> = {
  chest_discount: "Півціни в лавці скринь",
  dragon_heart: "Жар дракона",
  element_tincture: "Еліксир стихії",
  fourth_key: "Запасний ключ",
  gold_legacy: "Скарбничка предків",
  hunting_permit: "Дозвіл на полювання",
  magic_crystal: "Кристал магії",
  magic_shovel: "Чарівна лопата",
  master_charter: "Грамота майстра",
  miracle_heal: "Цілюща роса",
  shuffle: "Перетасовка",
  stone_skin: "Кам'яна шкура",
};
/** Items whose game system already exists; the others are shown locked. */
const AVAILABLE_ITEMS: ReadonlySet<BattlePassItemKind> = new Set(["hunting_permit", "magic_crystal"]);
const item = (kind: BattlePassItemKind): BattlePassReward => ({ available: AVAILABLE_ITEMS.has(kind), item: kind, kind: "item", label: BATTLE_PASS_ITEM_LABELS[kind] });

/**
 * Free rewards. Circle 1 keeps our shipped equipment on 100/200/300 (the reference has empty stops there);
 * circles 2–5 follow the reference: boost, silver, gold, card (+ locked items on circle 5).
 */
const FREE_REWARDS_BY_CIRCLE: readonly (readonly (BattlePassReward | null)[])[] = [
  [
    boost(2),
    { kind: "equipment", label: "Звичайне спорядження", rarity: "common" },
    silver(3_500_000, "3,5 млн срібла"),
    { kind: "equipment", label: "Незвичайне спорядження", rarity: "uncommon" },
    gold(350),
    { kind: "equipment", label: "Рідкісне спорядження", rarity: "rare" },
    card,
  ],
  [boost(3), null, silver(5_000_000, "5 млн срібла"), null, gold(500), null, card],
  [boost(4), null, silver(7_500_000, "7,5 млн срібла"), null, gold(700), null, card],
  [boost(4), null, silver(9_000_000, "9 млн срібла"), null, gold(900), null, card],
  [boost(4), item("magic_shovel"), silver(10_000_000, "10 млн срібла"), item("element_tincture"), gold(1_000), item("gold_legacy"), card],
];

/** VIP rewards on the same stops. The last stop has none: the reference VIP card only changes the card frame. */
const VIP_REWARDS_BY_CIRCLE: readonly (readonly (BattlePassReward | null)[])[] = [
  [item("chest_discount"), equipment("uncommon", "Незвичайне спорядження"), item("element_tincture"), item("hunting_permit"), item("miracle_heal"), item("gold_legacy"), null],
  [equipment("rare", "Рідкісне спорядження"), item("dragon_heart"), item("element_tincture"), item("magic_crystal"), item("shuffle"), item("stone_skin"), null],
  [item("chest_discount"), equipment("rare", "Рідкісне спорядження"), item("element_tincture"), item("fourth_key"), item("master_charter"), item("miracle_heal"), null],
  [item("chest_discount"), item("stone_skin"), equipment("epic", "Епічне спорядження"), item("hunting_permit"), item("magic_crystal"), item("miracle_heal"), null],
  [item("chest_discount"), item("hunting_permit"), item("stone_skin"), item("magic_crystal"), item("miracle_heal"), item("master_charter"), null],
];

export interface BattlePassMilestoneConfig {
  /** Threshold with the «Алмазна артіль» collection, when it differs. */
  brotherhoodThreshold: number | null;
  circle: number;
  id: string;
  reward: BattlePassReward | null;
  threshold: number;
  vip: { id: string; reward: BattlePassReward } | null;
}

export const BATTLE_PASS_MILESTONES: readonly BattlePassMilestoneConfig[] = BATTLE_PASS_CIRCLES.flatMap(({ brotherhoodThresholds, circle, thresholds }) =>
  thresholds.map((threshold, index) => {
    const rewards = FREE_REWARDS_BY_CIRCLE[circle - 1];
    const vipRewards = VIP_REWARDS_BY_CIRCLE[circle - 1];
    if (!rewards || !vipRewards) throw new Error(`Battle pass rewards for circle ${circle} are missing`);
    const id = `circle-${circle}-${threshold}`;
    const free = rewards[index];
    const vipReward = vipRewards[index];
    return {
      brotherhoodThreshold: brotherhoodThresholds?.[index] ?? null,
      circle,
      id,
      reward: free ? { ...free } : null,
      threshold,
      vip: vipReward ? { id: `${id}-vip`, reward: { ...vipReward } } : null,
    };
  }));

/** A reward that can actually be granted (empty stops and locked items cannot). */
export function isGrantableReward(reward: BattlePassReward | null | undefined): reward is BattlePassReward {
  return !!reward && (reward.kind !== "item" || reward.available);
}

export function getMilestoneThreshold(milestone: BattlePassMilestoneConfig, hasBrotherhood: boolean) {
  return hasBrotherhood && milestone.brotherhoodThreshold !== null ? milestone.brotherhoodThreshold : milestone.threshold;
}

export function getPlayerCircles(hasBrotherhood: boolean) {
  return BATTLE_PASS_CIRCLES.filter(({ requiresBrotherhood }) => !requiresBrotherhood || hasBrotherhood);
}

/**
 * Daily tasks pay gold, silver and a common equipment item, as in the reference; "win arenas" also pays an
 * epic-or-better card scaled by the arena league. Diamonds stay because they drive the battle pass.
 * Silver is 1000 per diamond, the reference marathon ratio, paid at once. Our own numbers otherwise.
 */
export const DAILY_TASKS = [
  { card: false, eventType: "DUEL_WON", id: "win-duels", rewardDiamonds: 1, rewardGold: 1, target: 20, title: "Виграйте 20 дуелей" },
  { card: false, eventType: "DUEL_FINISHED", id: "play-duels", rewardDiamonds: 1, rewardGold: 1, target: 30, title: "Проведіть 30 дуелей" },
  { card: false, eventType: "CAMPAIGN_CARD_DROP", id: "acquire-cards", rewardDiamonds: 1, rewardGold: 1, target: 3, title: "Отримайте 3 карти в кампанії" },
  { card: false, eventType: "CARD_ABSORBED", id: "absorb-cards", rewardDiamonds: 1, rewardGold: 1, target: 10, title: "Поглиніть 10 карт" },
  { card: false, eventType: "SHOP_CARD_PURCHASED", id: "buy-cards", rewardDiamonds: 2, rewardGold: 2, target: 5, title: "Придбайте 5 карт" },
  { card: false, eventType: "CARD_LEVEL_UP", id: "upgrade-card", rewardDiamonds: 1, rewardGold: 1, target: 1, title: "Покращте бойову карту 1 раз" },
  { card: false, eventType: "ARENA_FINISHED", id: "play-arenas", rewardDiamonds: 3, rewardGold: 3, target: 10, title: "Зіграйте 10 боїв на арені" },
  { card: true, eventType: "ARENA_WON", id: "win-arenas", rewardDiamonds: 3, rewardGold: 0, target: 5, title: "Виграйте 5 арен" },
] as const;

export const DAILY_TASK_SILVER_PER_DIAMOND = 1_000;
export const DAILY_TASK_EQUIPMENT_RARITY = "common" as const;

/** Finds a stop by its free or VIP reward id. */
export function getBattlePassMilestone(id: string) {
  const milestone = BATTLE_PASS_MILESTONES.find((candidate) => candidate.id === id || candidate.vip?.id === id);
  return milestone ? { milestone, vip: milestone.vip?.id === id } : null;
}

export function getDailyTask(id: string) {
  return DAILY_TASKS.find((task) => task.id === id) ?? null;
}

export function getSeasonWindow(now: Date) {
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    endsAt,
    seasonId: `${startsAt.getUTCFullYear()}-${String(startsAt.getUTCMonth() + 1).padStart(2, "0")}`,
    startsAt,
  };
}

export function getDayWindow(now: Date) {
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endsAt = new Date(startsAt);
  endsAt.setUTCDate(endsAt.getUTCDate() + 1);
  return {
    endsAt,
    taskDate: startsAt.toISOString().slice(0, 10),
    startsAt,
  };
}
