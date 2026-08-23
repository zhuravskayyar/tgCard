import type {
  CampaignDialogue,
  CampaignDialogueEmotion,
  CampaignNavigationTarget,
  CampaignReward,
} from "@cardastika/shared";

export const CAMPAIGN_ID = "campaign_1" as const;
export const CAMPAIGN_STAGE_COUNT = 6;
export const CAMPAIGN_QUESTS_PER_STAGE = 6;

export type CampaignMetric =
  | "deck_and_card_opened"
  | "duel_finished"
  | "shop_purchase"
  | "collections_and_detail_opened"
  | "cards_absorbed"
  | "card_level_up"
  | "duel_won"
  | "card_discovered"
  | "accepted_referral"
  | "win_streak"
  | "acquired_rare"
  | "maximum_owned_card_level"
  | "single_collection_discoveries"
  | "duel_strong_hit"
  | "neutral_hit_win"
  | "owned_nonstarter_elements"
  | "single_collection_percentage"
  | "weak_card_count"
  | "acquired_epic"
  | "ready_additional_wins";

export interface CampaignQuestDefinition {
  description: string;
  id: string;
  metric: CampaignMetric;
  navigation?: CampaignNavigationTarget;
  reward: CampaignReward;
  target: number;
  title: string;
}

export interface CampaignStageDefinition {
  dialogue: CampaignDialogue;
  id: string;
  number: number;
  quests: readonly CampaignQuestDefinition[];
  title: string;
}

function vartDialogue(
  id: string,
  trigger: CampaignDialogue["trigger"],
  emotion: CampaignDialogueEmotion,
  text: string[],
  options: Pick<CampaignDialogue, "action" | "questId" | "stageId"> = {},
): CampaignDialogue {
  return {
    id,
    trigger,
    npcId: "vart",
    npcName: "Варт",
    npcArtKey: `npc/vart/${emotion}`,
    emotion,
    text,
    ...options,
  };
}

function quest(
  id: string,
  title: string,
  description: string,
  metric: CampaignMetric,
  target: number,
  reward: CampaignReward,
  navigation?: CampaignNavigationTarget,
): CampaignQuestDefinition {
  return { id, title, description, metric, target, reward, ...(navigation ? { navigation } : {}) };
}

export const CAMPAIGN_STAGES: readonly CampaignStageDefinition[] = Object.freeze([
  {
    id: "stage_1",
    number: 1,
    title: "Початок",
    dialogue: vartDialogue("stage_1_start", "campaign_start", "neutral", [
      "Ти нарешті тут. Добре.",
      "Я — Варт. Якщо хочеш вижити, почнемо з твоєї колоди.",
    ], { stageId: "stage_1", action: "deck" }),
    quests: [
      quest("1.1", "Моя колода", "Відкрий бойову колоду та деталі будь-якої своєї карти.", "deck_and_card_opened", 2, { xp: 0, silver: 100 }, "deck"),
      quest("1.2", "Перша дуель", "Заверши одну дуель. Перемога не обов'язкова.", "duel_finished", 1, { xp: 100, silver: 0 }, "duel"),
      quest("1.3", "Нова карта", "Купи одну карту в магазині.", "shop_purchase", 1, { xp: 0, silver: 150 }, "shop"),
      quest("1.4", "Колекції", "Відкрий список колекцій і деталі будь-якої колекції.", "collections_and_detail_opened", 2, { xp: 100, silver: 0 }, "collections"),
      quest("1.5", "Слабка карта", "Поглинь щонайменше одну слабку карту тієї самої стихії.", "cards_absorbed", 1, { xp: 0, silver: 200 }, "weak"),
      quest("1.6", "Перший рівень", "Підніми рівень будь-якої карти один раз.", "card_level_up", 1, { xp: 150, silver: 100 }, "deck"),
    ],
  },
  {
    id: "stage_2",
    number: 2,
    title: "Збирач",
    dialogue: vartDialogue("stage_2_start", "stage_start", "happy", [
      "Навіть найкраща колода не робить світ менш порожнім.",
      "Поклич когось із собою.",
    ], { stageId: "stage_2" }),
    quests: [
      quest("2.1", "Перша перемога", "Виграй одну дуель.", "duel_won", 1, { xp: 150, silver: 100 }, "duel"),
      quest("2.2", "Три покупки", "Купи три карти після відкриття етапу.", "shop_purchase", 3, { xp: 0, silver: 250 }, "shop"),
      quest("2.3", "Нові знахідки", "Відкрий дві нові колекційні карти.", "card_discovered", 2, { xp: 150, silver: 0 }, "collections"),
      quest("2.4", "Корм", "Поглинь сумарно три слабкі карти.", "cards_absorbed", 3, { xp: 0, silver: 250 }, "weak"),
      quest("2.5", "Посилення", "Підніми рівні карт сумарно три рази.", "card_level_up", 3, { xp: 200, silver: 0 }, "deck"),
      quest("2.6", "Поклич друга", "Запроси друга через персональне Telegram referral-посилання.", "accepted_referral", 1, { xp: 0, silver: 100 }),
    ],
  },
  {
    id: "stage_3",
    number: 3,
    title: "Сильніша колода",
    dialogue: vartDialogue("stage_3_start", "stage_start", "mysterious", [
      "Деякі сліди повторюються.",
      "І мені це не подобається.",
    ], { stageId: "stage_3" }),
    quests: [
      quest("3.1", "Три перемоги", "Виграй три дуелі.", "duel_won", 3, { xp: 250, silver: 0 }, "duel"),
      quest("3.2", "Серія", "Досягни серії з двох перемог поспіль.", "win_streak", 2, { xp: 0, silver: 250 }, "duel"),
      quest("3.3", "Рідкісна знахідка", "Отримай карту Rare або вищої рідкості після відкриття етапу.", "acquired_rare", 1, { xp: 200, silver: 0 }, "shop"),
      quest("3.4", "П'ять слабких", "Поглинь п'ять слабких карт.", "cards_absorbed", 5, { xp: 0, silver: 300 }, "weak"),
      quest("3.5", "Рівень 10", "Май хоча б одну карту Lv10 або вище.", "maximum_owned_card_level", 10, { xp: 250, silver: 0 }, "deck"),
      quest("3.6", "Колекційний слід", "Відкрий щонайменше три карти в одній колекції.", "single_collection_discoveries", 3, { xp: 0, silver: 300 }, "collections"),
    ],
  },
  {
    id: "stage_4",
    number: 4,
    title: "Стихії",
    dialogue: vartDialogue("stage_4_start", "stage_start", "warning", [
      "Тепер я впевнений: хтось використовує цей розлад навмисно.",
    ], { stageId: "stage_4" }),
    quests: [
      quest("4.1", "Перевага", "Виконай десять ударів із множником ×1.5 у Duel.", "duel_strong_hit", 10, { xp: 250, silver: 0 }, "duel"),
      quest("4.2", "Без переваги", "Виграй дуель, у якій виконав щонайменше три нейтральні удари ×1.", "neutral_hit_win", 1, { xp: 0, silver: 300 }, "duel"),
      quest("4.3", "Витримати", "Заверши три дуелі незалежно від результату.", "duel_finished", 3, { xp: 200, silver: 0 }, "duel"),
      quest("4.4", "Чотири стихії", "Май не-стартову карту кожної з чотирьох стихій.", "owned_nonstarter_elements", 4, { xp: 0, silver: 300 }, "deck"),
      quest("4.5", "Ще сильніше", "Підніми рівні карт сумарно п'ять разів.", "card_level_up", 5, { xp: 300, silver: 0 }, "deck"),
      quest("4.6", "Серія трьох", "Досягни серії з трьох перемог у Duel.", "win_streak", 3, { xp: 0, silver: 350 }, "duel"),
    ],
  },
  {
    id: "stage_5",
    number: 5,
    title: "Слід",
    dialogue: vartDialogue("stage_5_start", "stage_start", "serious", [
      "Тепер я знаю, кого ми шукаємо.",
      "Але ім'я скажу тоді, коли ти будеш готовий піти до кінця.",
    ], { stageId: "stage_5" }),
    quests: [
      quest("5.1", "П'ять перемог", "Виграй п'ять дуелей.", "duel_won", 5, { xp: 350, silver: 0 }, "duel"),
      quest("5.2", "Колекціонер", "Відкрий п'ять нових колекційних карт під час етапу.", "card_discovered", 5, { xp: 0, silver: 400 }, "collections"),
      quest("5.3", "Магазин", "Здійсни п'ять покупок карт.", "shop_purchase", 5, { xp: 300, silver: 0 }, "shop"),
      quest("5.4", "Десять слабких", "Поглинь десять слабких карт.", "cards_absorbed", 10, { xp: 0, silver: 450 }, "weak"),
      quest("5.5", "Сильна карта", "Май карту Lv15 або вище.", "maximum_owned_card_level", 15, { xp: 350, silver: 0 }, "deck"),
      quest("5.6", "Майже зібрано", "Досягни прогресу не менше 50% у будь-якій колекції.", "single_collection_percentage", 50, { xp: 0, silver: 450 }, "collections"),
    ],
  },
  {
    id: "stage_6",
    number: 6,
    title: "Перед лігвом",
    dialogue: vartDialogue("stage_6_start", "stage_start", "warning", [
      "Мантикора. Ось хто стоїть у кінці цього сліду.",
      "Вона ховає свої карти. Ти не побачиш ні стихії, ні сили, ні переваги, поки не атакуєш.",
    ], { stageId: "stage_6" }),
    quests: [
      quest("6.1", "П'ять боїв", "Заверши п'ять дуелей.", "duel_finished", 5, { xp: 400, silver: 0 }, "duel"),
      quest("6.2", "Три перемоги поспіль", "Досягни серії з трьох перемог.", "win_streak", 3, { xp: 0, silver: 500 }, "duel"),
      quest("6.3", "Підготовка карт", "Підніми рівні карт сумарно шість разів.", "card_level_up", 6, { xp: 400, silver: 0 }, "deck"),
      quest("6.4", "Запас", "Май щонайменше дев'ять слабких карт одночасно.", "weak_card_count", 9, { xp: 0, silver: 500 }, "weak"),
      quest("6.5", "Новий трофей", "Отримай Epic або вищу карту після початку етапу.", "acquired_epic", 1, { xp: 450, silver: 0 }, "shop"),
      quest("6.6", "Готовий", "Після інших п'яти квестів виграй три додаткові дуелі.", "ready_additional_wins", 3, { xp: 300, silver: 600 }, "duel"),
    ],
  },
]);

export const BOSS_UNLOCKED_DIALOGUE = vartDialogue("boss_unlocked", "boss_unlocked", "battle", [
  "Все.",
  "Далі — тільки Мантикора.",
]);

export const BOSS_INTRO_DIALOGUES = Object.freeze([
  vartDialogue("boss_intro_1", "boss_intro", "mysterious", ["Не намагайся вгадати те, чого не бачиш."]),
  vartDialogue("boss_intro_2", "boss_intro", "warning", [
    "Мантикора приховує карти до самої атаки.",
    "Після удару дивись у журнал. Там брехні не буде.",
  ]),
  vartDialogue("boss_intro_3", "boss_intro", "battle", ["Обирай слот.", "І не витрачай час на страх."]),
]);

export const BOSS_VICTORY_DIALOGUES = Object.freeze([
  vartDialogue("boss_victory_1", "boss_victory", "surprised", ["Ти справді її здолав."]),
  vartDialogue("boss_victory_2", "boss_victory", "proud", ["Забери її карту.", "Тепер ця сила працюватиме на тебе."]),
  vartDialogue("boss_victory_3", "boss_victory", "mysterious", ["Але розлад не зник.", "Ми закрили лише перший слід."]),
]);

export const CAMPAIGN_BOSS_CARD_CONFIG = Object.freeze([
  { code: "elementals_01", level: 15 },
  { code: "elementals_05", level: 16 },
  { code: "monsters_02", level: 18 },
  { code: "elementals_02", level: 15 },
  { code: "monsters_03", level: 17 },
  { code: "elementals_03", level: 16 },
  { code: "monsters_04", level: 18 },
  { code: "elementals_04", level: 17 },
  { code: "monsters_01", level: 15 },
]);

export const MANTICORE_CARD_CODE = "monsters_03";

export function getCampaignStage(stageNumber: number) {
  return CAMPAIGN_STAGES[stageNumber - 1];
}

export function getCampaignQuest(questId: string) {
  return CAMPAIGN_STAGES.flatMap(({ quests }) => quests).find(({ id }) => id === questId);
}

export function getQuestDialogue(
  stageId: string,
  definition: CampaignQuestDefinition,
): CampaignDialogue {
  return vartDialogue(`quest_${definition.id}_intro`, "quest_intro", "serious", [definition.description], {
    stageId,
    questId: definition.id,
    ...(definition.navigation ? { action: definition.navigation } : {}),
  });
}
