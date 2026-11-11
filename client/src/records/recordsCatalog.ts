import type { AchievementStatisticKey, PlayerAchievementProgressResponse } from "@cardastika/shared";

export interface AchievementLevel {
  threshold: number;
  target?: string;
}

export interface AchievementRecord {
  id: string;
  title: string;
  image: string;
  description: string;
  statistic: AchievementStatisticKey;
  unit: string;
  levels: readonly AchievementLevel[];
}

export interface AchievementRecordGroup {
  title: string;
  records: readonly AchievementRecord[];
}

const image = (name: string) => `/assets/achievements/${name}.webp`;
const counted = (thresholds: readonly number[]): AchievementLevel[] => thresholds.map((threshold) => ({ threshold }));
const single = (target: string): AchievementLevel[] => [{ threshold: 1, target }];

export const ACHIEVEMENT_RECORD_GROUPS: readonly AchievementRecordGroup[] = [
  {
    title: "Дуелі",
    records: [
      { id: "duel-wins", title: "Перемоги в дуелях", image: image("duel-wins"), description: "Одержуй перемоги у звичайних дуелях.", statistic: "duelWins", unit: "перемог", levels: counted([100, 20_000, 100_000]) },
      { id: "duel-top100", title: "Топ-100 дуелянтів", image: image("duel-top100"), description: "Увійди до першої сотні рейтингу дуелянтів.", statistic: "duelTop100", unit: "", levels: single("Увійти до топ-100 дуелянтів") },
      { id: "duel-champion", title: "Перше місце в дуелях", image: image("duel-champion"), description: "Посідай перше місце у рейтингу дуелянтів.", statistic: "duelChampion", unit: "", levels: single("Посісти 1 місце у рейтингу дуелянтів") },
    ],
  },
  {
    title: "Арена і турнір",
    records: [
      { id: "arena-wins", title: "Перемоги на арені", image: image("arena-wins"), description: "Перемагай суперників у матчах арени.", statistic: "arenaWins", unit: "перемог", levels: counted([50, 3_000, 10_000]) },
      { id: "arena-mage-wins", title: "Переможені маги на арені", image: image("arena-mage-wins"), description: "Вибивай суперників з бою на арені.", statistic: "arenaMageWins", unit: "суперників", levels: counted([100, 3_000, 10_000]) },
      { id: "arena-top100", title: "Топ-100 арени", image: image("arena-top100"), description: "Увійди до першої сотні рейтингу арени.", statistic: "arenaTop100", unit: "", levels: single("Увійти до топ-100 арени") },
      { id: "arena-champion", title: "Перше місце в рейтингу арени", image: image("arena-champion"), description: "Посідай перше місце у рейтингу арени.", statistic: "arenaChampion", unit: "", levels: single("Посісти 1 місце у рейтингу арени") },
      { id: "tournament-champion", title: "Чемпіон турніру майстрів", image: image("tournament-champion"), description: "Виграй турнір Майстрів.", statistic: "tournamentChampion", unit: "турнірів", levels: single("Виграти турнір Майстрів") },
    ],
  },
  {
    title: "Нашестя Урфіна",
    records: [
      { id: "urfin-boss-damage", title: "Шкода босам за одне нашестя", image: image("urfin-boss-damage"), description: "Нанось шкоду босам протягом одного Нашестя Урфіна.", statistic: "urfinBossDamage", unit: "шкоди", levels: counted([1_000_000, 25_000_000, 100_000_000]) },
      { id: "urfin-super-strikes", title: "Суперудари в нашесті", image: image("urfin-super-strikes"), description: "Виконуй суперудари під час Нашестя Урфіна.", statistic: "urfinSuperStrikes", unit: "суперударів", levels: counted([5, 25, 100]) },
      { id: "urfin-card-rewards", title: "Отримані карти за шкоду босу", image: image("urfin-card-rewards"), description: "Отримуй карти як нагороду за шкоду босам.", statistic: "urfinCardRewards", unit: "", levels: [
        { threshold: 1, target: "1 карту" }, { threshold: 10, target: "10 карт" }, { threshold: 50, target: "50 карт" },
      ] },
      { id: "urfin-damage-rank", title: "Перше місце за шкодою", image: image("urfin-damage-rank"), description: "Посідай перше місце за шкодою та отримуй карти.", statistic: "urfinDamageRank", unit: "", levels: [
        { threshold: 1, target: "1 раз" }, { threshold: 5, target: "5 разів" }, { threshold: 20, target: "20 разів" },
      ] },
    ],
  },
  {
    title: "Гільдія і рейди",
    records: [
      { id: "guild-gold", title: "Золото в казну", image: image("guild-gold"), description: "Внось золото до казни гільдії.", statistic: "guildGold", unit: "золота", levels: counted([100, 10_000, 50_000]) },
      { id: "guild-element-donations", title: "Пожертви елементів у карту гільдії", image: image("guild-element-donations"), description: "Внось елементи до карти гільдії.", statistic: "guildElementDonations", unit: "елементів", levels: counted([50_000, 500_000, 5_000_000]) },
      { id: "guild-dragon-hunts", title: "Дракони в рейдах", image: image("guild-dragon-hunts"), description: "Перемагай драконів у гільдійних рейдах.", statistic: "guildDragonHunts", unit: "перемог", levels: counted([25, 250, 1_000]) },
      { id: "guild-war-keys", title: "Ключі у війнах гільдій", image: image("guild-war-keys"), description: "Здобувай ключі під час воєн гільдій.", statistic: "guildWarKeys", unit: "ключів", levels: counted([25, 150, 300]) },
      { id: "guild-war-participation", title: "Участь у війнах гільдій", image: image("guild-war-participation"), description: "Бери участь у битвах гільдій.", statistic: "guildWarParticipation", unit: "битв", levels: counted([15, 100, 200]) },
      { id: "guild-experience", title: "Досвід у гільдії", image: image("guild-experience"), description: "Здобувай досвід для своєї гільдії.", statistic: "guildExperience", unit: "досвіду", levels: counted([30_000_000, 3_000_000_000, 30_000_000_000]) },
      { id: "witch-victories", title: "Перемоги над відьмами", image: image("witch-victories"), description: "Перемагай відьом у гільдійних рейдах.", statistic: "witchVictories", unit: "перемог", levels: counted([100, 200, 500]) },
    ],
  },
  {
    title: "Інші досягнення",
    records: [
      { id: "deck-power", title: "Сила бойової колоди", image: image("deck-power"), description: "Розвивай силу своєї бойової колоди.", statistic: "deckPower", unit: "сили", levels: counted([30_000, 60_000, 90_000]) },
      { id: "collections-butterfly", title: "Зібрані колекції", image: image("collections-butterfly"), description: "Завершуй колекції карт.", statistic: "completedCollections", unit: "колекцій", levels: counted([10, 15]) },
      { id: "chest-shops", title: "Завершені крамниці скринь", image: image("chest-shops"), description: "Завершуй крамниці скринь.", statistic: "completedChestShops", unit: "", levels: [
        { threshold: 1, target: "1 крамницю скринь" }, { threshold: 50, target: "50 крамниць скринь" }, { threshold: 200, target: "200 крамниць скринь" },
      ] },
      { id: "marathon-wins", title: "Перемоги в марафоні", image: image("marathon-wins"), description: "Перемагай у марафоні.", statistic: "marathonWins", unit: "перемог", levels: counted([1, 10]) },
      { id: "sent-gifts", title: "Надіслані подарунки", image: image("sent-gifts"), description: "Надсилай подарунки іншим гравцям.", statistic: "giftsSent", unit: "подарунків", levels: counted([20, 100, 1_000]) },
      { id: "received-gifts", title: "Отримані подарунки", image: image("received-gifts"), description: "Отримуй подарунки від інших гравців.", statistic: "giftsReceived", unit: "подарунків", levels: counted([10, 100, 1_000]) },
    ],
  },
  {
    title: "Спорядження",
    records: [
      { id: "forge-items", title: "Створені речі в кузні", image: image("forge-items"), description: "Створюй речі у кузні.", statistic: "forgedItems", unit: "речей", levels: counted([1_000, 2_000, 3_000]) },
      { id: "forge-artifacts", title: "Створені артефакти в кузні", image: image("forge-artifacts"), description: "Створюй артефакти у кузні.", statistic: "forgedArtifacts", unit: "артефактів", levels: counted([200, 500, 1_000]) },
    ],
  },
];

export function getFeaturedAchievements(statistics: PlayerAchievementProgressResponse["statistics"]) {
  return ACHIEVEMENT_RECORD_GROUPS.flatMap(({ records }) => records)
    .map((record) => ({
      record,
      earnedLevel: record.levels.filter(({ threshold }) => {
        const value = statistics[record.statistic];
        return value !== null && value >= threshold;
      }).length,
    }))
    .filter(({ earnedLevel }) => earnedLevel > 0)
    .sort((left, right) => right.earnedLevel - left.earnedLevel)
    .slice(0, 3);
}

export function isCompactAchievementImage(record: AchievementRecord) {
  return record.id === "guild-dragon-hunts" || record.id === "guild-war-participation" || record.id === "urfin-damage-rank";
}
