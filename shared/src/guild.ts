import type { CardElement, CardProgressionView, PlayerCardInstance } from "./card.js";
import type { DuelCardSnapshot, ElementMultiplier } from "./duel.js";
import type { PlayerMailCardReward } from "./mail.js";

export type GuildLanguage = "uk" | "ru" | "en" | "de" | "other";
export type GuildRecruitmentMode = "open" | "application" | "closed";
export type GuildRole = "leader" | "officer" | "veteran" | "member" | "newbie";
export type GuildActivityType =
  | "duel_win"
  | "duel_loss"
  | "campaign_win"
  | "campaign_loss"
  | "tournament_battle"
  | "dragon_raid"
  /** Older contributions only: arena and dungeon pay no player XP, so they add no guild XP now. */
  | "dungeon_complete"
  | "arena_place_1"
  | "arena_place_2"
  | "arena_place_3"
  | "arena_place_4_6";
export type GuildPermission =
  | "view_members"
  | "leave_guild"
  | "manage_settings"
  | "manage_applications"
  | "manage_roles"
  | "kick_members"
  | "transfer_leadership"
  | "dissolve_guild"
  | "manage_announcements";

export type GuildJournalEventType =
  | "guild_created"
  | "member_joined"
  | "member_left"
  | "member_kicked"
  | "role_changed"
  | "application_accepted"
  | "application_rejected"
  | "xp_contributed"
  | "treasury_contributed"
  | "announcement_updated"
  | "guild_card_upgraded"
  | "dragon_raid_won"
  | "dragon_raid_lost"
  | "dragon_lair_upgraded"
  | "witch_raid_won";

export type GuildForumVisibility = "public" | "private";

export const GUILD_CONFIG = Object.freeze({
  unlockLevel: 10,
  creationCostSilver: 10_000,
  maxLevel: 55,
  pageSize: 20,
  maxMembersByLevel: Object.freeze(Array.from({ length: 55 }, () => 30)),
  nameMinLength: 3,
  nameMaxLength: 10,
  descriptionMaxLength: 500,
  applicationTtlHours: 72,
  leaveCooldownHours: 24,
  kickCooldownHours: 24,
  rejectionCooldownHours: 12,
  treasuryContributionUnlockHours: 72,
  /** Gold one player may put into the treasury per UTC day; «Рідкісні змії» raise it (reference: 5 → 10). */
  treasuryDailyGoldLimit: 5,
  treasuryDailyGoldLimitWithCollection: 10,
  // Reference: every XP point a member earns also goes to the guild (no daily cap). The weekly
  // mission is our own; its target is sized to battles that pay thousands of XP each.
  guildMissionBaseXp: 600_000,
  guildMissionXpPerMember: 240_000,
  levelXpThresholds: Object.freeze([
    0,
    1_000_000,
    1_500_000,
    2_000_000,
    2_500_000,
    4_000_000,
    6_000_000,
    8_000_000,
    10_000_000,
    13_000_000,
    16_000_000,
    19_000_000,
    23_000_000,
    28_000_000,
    33_000_000,
    38_000_000,
    45_000_000,
    53_000_000,
    61_000_000,
    75_000_000,
    164_000_000,
    257_000_000,
    299_000_000,
    332_000_000,
    382_000_000,
    420_000_000,
    481_000_000,
    527_000_000,
    597_000_000,
    651_000_000,
    1_164_000_000,
    1_292_000_000,
    1_432_000_000,
    1_576_000_000,
    1_726_000_000,
    3_290_000_000,
    3_680_000_000,
    4_080_000_000,
    4_510_000_000,
    4_970_000_000,
    10_800_000_000,
    12_100_000_000,
    14_080_000_000,
    14_970_000_000,
    16_430_000_000,
    18_340_000_000,
    19_850_000_000,
    21_400_000_000,
    23_130_000_000,
    25_290_000_000,
    5_000_000_000_000,
    10_000_000_000_000,
    20_000_000_000_000,
    50_000_000_000_000,
    100_000_000_000_000,
  ]),
});

export const GUILD_LEVEL_REWARDS = Object.freeze([
  { level: 2, label: "Нова форма емблеми" },
  { level: 3, label: "Рамка профілю гільдії" },
  { level: 5, label: "Прапор гільдії" },
  { level: 8, label: "Ефект залу гільдії" },
] as const);

export const GUILD_ROLE_LABELS: Readonly<Record<GuildRole, string>> = Object.freeze({
  leader: "Лідер",
  officer: "Офіцер",
  veteran: "Ветеран",
  member: "Учасник",
  newbie: "Новачок",
});

export const GUILD_ROLE_PERMISSIONS = Object.freeze({
  leader: Object.freeze([
    "view_members",
    "leave_guild",
    "manage_settings",
    "manage_applications",
    "manage_roles",
    "kick_members",
    "transfer_leadership",
    "dissolve_guild",
    "manage_announcements",
  ]),
  officer: Object.freeze([
    "view_members",
    "leave_guild",
    "manage_applications",
    "manage_roles",
    "kick_members",
    "manage_announcements",
  ]),
  veteran: Object.freeze(["view_members", "leave_guild"]),
  member: Object.freeze(["view_members", "leave_guild"]),
  newbie: Object.freeze(["view_members", "leave_guild"]),
}) as Readonly<Record<GuildRole, readonly GuildPermission[]>>;

const GUILD_ROLE_PRIORITY: Readonly<Record<GuildRole, number>> = Object.freeze({
  leader: 5,
  officer: 4,
  veteran: 3,
  member: 2,
  newbie: 1,
});

const GUILD_NAME_LETTERS = "A-Za-zАБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯабвгґдеєжзиіїйклмнопрстуфхцчшщьюя";
const GUILD_NAME_PATTERN = new RegExp(`^[${GUILD_NAME_LETTERS}0-9][${GUILD_NAME_LETTERS}0-9 _'-]*[${GUILD_NAME_LETTERS}0-9]$`, "u");

export interface GuildSummary {
  activityScore: number;
  createdAt: string;
  description: string;
  emblemId: string;
  experience: number;
  id: string;
  isFull: boolean;
  language: GuildLanguage;
  level: number;
  memberCapacity: number;
  memberCount: number;
  minPlayerLevel: number;
  name: string;
  recruitmentMode: GuildRecruitmentMode;
  themeElement: CardElement | null;
  nextLevelExperience: number | null;
}

export interface GuildMemberView {
  contributedXp: number;
  displayName: string;
  joinedAt: string;
  level: number;
  photoUrl: string | null;
  playerId: string;
  role: GuildRole;
}

export interface GuildApplicationView {
  createdAt: string;
  expiresAt: string;
  guildId: string;
  id: string;
  playerId: string;
  playerLevel: number;
  playerName: string;
}

export interface GuildViewerState {
  activeApplication: GuildApplicationView | null;
  member: GuildMemberView | null;
  permissions: readonly GuildPermission[];
}

export interface GuildAnnouncementView {
  authorName: string;
  body: string;
  createdAt: string;
  id: string;
  updatedAt: string;
}

export interface GuildJournalEntryView {
  activityType: GuildActivityType | null;
  actorName: string | null;
  amount: number | null;
  createdAt: string;
  detail: string;
  id: string;
  targetName: string | null;
  type: GuildJournalEventType;
}

export interface GuildMissionView {
  completed: boolean;
  description: string;
  id: string;
  periodEnd: string;
  periodStart: string;
  progress: number;
  rewardLabel: string;
  target: number;
  title: string;
}

export interface GuildDashboardView {
  activeMemberCount: number;
  announcement: GuildAnnouncementView | null;
  journal: readonly GuildJournalEntryView[];
  mission: GuildMissionView;
  nextReward: { label: string; level: number } | null;
  todayExperience: number;
  weeklyExperience: number;
}

export interface GuildProfileResponse {
  altar: GuildAltarView;
  applications: readonly GuildApplicationView[];
  dashboard: GuildDashboardView;
  guild: GuildSummary;
  guildCard: GuildCardView;
  members: readonly GuildMemberView[];
  treasury: GuildTreasuryView;
  viewer: GuildViewerState;
}

export interface GuildCardView {
  active: PlayerCardInstance | null;
  canManage: boolean;
  /** The leader and officers raise the Guild Card level with treasury gold. */
  canLevelUp: boolean;
  /** Level-up state against the treasury gold; null without an active Guild Card. */
  progression: CardProgressionView | null;
}

export type GuildTreasuryCurrency = "gold" | "silver";

export interface GuildTreasuryMemberView {
  cardElements: number;
  contributedGold: number;
  contributedSilver: number;
  contributedXp: number;
  displayName: string;
  joinedAt: string;
  playerId: string;
  role: GuildRole;
}

export interface GuildTreasuryView {
  balance: { gold: number; silver: number };
  members: readonly GuildTreasuryMemberView[];
  viewer: {
    canContribute: boolean;
    /** Gold the viewer may still put in today. */
    goldDailyRemaining: number;
    goldDailyLimit: number;
    gold: number;
    silver: number;
    contributionAvailableAt: string;
  };
}

export interface GuildTreasuryCardCandidatesResponse {
  cards: readonly PlayerCardInstance[];
}

export type GuildAltarCurrency = "gold" | "silver";

/** One altar potion; it lasts until the end of the UTC day. */
export interface GuildAltarUpgradeView {
  canAfford: boolean;
  /** Extra levels from the full «Чотири чаклунки» collection (gold potion only). */
  collectionBonus: number;
  currency: GuildAltarCurrency;
  /** HP bonus in percent for tournament battles while the potion lasts. */
  hpPct: number;
  name: string;
  price: number;
  /** Altar level the potion gives (same as hpPct for gold, half for silver). */
  totalIncrease: number;
}

export interface GuildAltarView {
  /** Highest witch level the guild beat last week; 0 when nothing was beaten. */
  currentLevel: number;
  /** Required guild level for the altar (reference: 34). */
  unlockLevel: number;
  unlocked: boolean;
  /** Potion bought today, if any. */
  active: { currency: GuildAltarCurrency; hpPct: number; expiresAt: string } | null;
  upgrades: readonly GuildAltarUpgradeView[];
}

export interface GuildRaidBossView {
  artKey: string;
  cardId: string;
  code: string;
  currentHealth: number;
  displayName: string;
  element: CardElement;
  health: number;
  level: number;
}

export type GuildRaidBattleStatus = "active" | "won" | "lost";
export type GuildRaidBattleLogKind = "attack" | "heal" | "curse" | "death" | "breath" | "swap";

export interface GuildRaidEnrollmentView {
  canStart: boolean;
  enrolled: boolean;
  leaderId: string | null;
  participantCount: number;
}

export interface GuildRaidBattleLogEntry {
  attackerCard?: DuelCardSnapshot;
  defenderCard?: DuelCardSnapshot;
  id: string;
  kind: GuildRaidBattleLogKind;
  multiplier?: ElementMultiplier;
  playerDamage: number;
  slotIndex?: 0 | 1 | 2;
  targetBossSlot?: 1 | 2;
  text: string;
  turnNumber: number;
  witchDamage: number;
  witchMultiplier?: ElementMultiplier;
}

export interface GuildRaidBattleView {
  battleId: string;
  battleLog: readonly GuildRaidBattleLogEntry[];
  cardChanges: number;
  playerActiveCards: readonly [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];
  playerHp: number;
  playerMaxHp: number;
  raidLevel: number;
  status: GuildRaidBattleStatus;
  targetBossSlot: 1 | 2;
  turnNumber: number;
  version: number;
  witchActiveCards: readonly [
    readonly [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot],
    readonly [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot],
  ];
}

export interface GuildRaidRewardView {
  card?: PlayerMailCardReward;
  gold: number;
  mailId?: string;
  percentage: number;
  silver: number;
}

export interface GuildRaidResultParticipantView {
  damage: number;
  displayName: string;
  duelRating: number;
  joinedAt: string;
  photoUrl: string | null;
  placement: number;
  playerId: string;
  /** Rows from before the treasure rules carried a placement reward. */
  reward?: GuildRaidRewardView;
}

export interface GuildRaidResultView {
  completedAt: string;
  id: string;
  level: number;
  participantCount: number;
  participants: readonly GuildRaidResultParticipantView[];
  totalDamage: number;
  /** The random participant who got the treasure offer for this level. */
  treasurePlayer: { playerId: string; displayName: string } | null;
}

export interface GuildRaidDamageParticipantView {
  damage: number;
  displayName: string;
  duelRating: number;
  photoUrl: string | null;
  playerId: string;
}

export interface GuildRaidActionRequest {
  bossSlot: 1 | 2;
  expectedVersion: number;
  slotIndex: 0 | 1 | 2;
}

export type GuildWitchTreasureStatus = "offered" | "digging" | "claimed" | "declined" | "expired";

export interface GuildWitchTreasureView {
  id: string;
  level: number;
  status: GuildWitchTreasureStatus;
  /** End of the raid week for an offer; end of digging while digging. */
  availableUntil: string | null;
  digEndsAt: string | null;
  digMinutes: number;
  reward: { kind: "gold" | "silver"; amount: number } | { kind: "card"; card: PlayerMailCardReward; bonusPower: number } | null;
  mailId: string | null;
}

export interface GuildRaidView {
  /** Guild level that opens witch raids (reference: 34). */
  unlockLevel: number;
  unlocked: boolean;
  guildLevel: number;
  /** The viewer's newest treasure this week, if any. */
  treasure: GuildWitchTreasureView | null;
  bosses: readonly GuildRaidBossView[];
  battle: GuildRaidBattleView | null;
  damageLeaderboard: readonly GuildRaidDamageParticipantView[];
  enrollment: GuildRaidEnrollmentView;
  id: string;
  level: number;
  nextLevel: number;
  lastResult: GuildRaidResultView | null;
  name: string;
  status: "open" | "active";
}

export interface GuildRaidSwapRequest {
  expectedVersion: number;
}

export type GuildDragonLairKind = "ancient" | "rare";

export interface GuildDragonLairView {
  code: string;
  kind: GuildDragonLairKind;
  lairName: string;
  dragon: { artKey: string; cardId: string; code: string; displayName: string; element: CardElement };
  health: number;
  currentHealth: number;
  lairLevel: number;
  respawnHours: number;
  /** Next lair upgrade paid from the treasury; null at level 20 or above the guild level. */
  nextUpgrade: { level: number; currency: "gold" | "silver"; amount: number; allowed: boolean } | null;
  status: "open" | "active";
  participantCount: number;
  viewerEnrolled: boolean;
  /** The dragon respawns for the viewer at this time after the viewer beat it. */
  viewerAvailableAt: string | null;
  defeatedCount: number;
}

export interface GuildDragonRaidListView {
  lairs: readonly GuildDragonLairView[];
  /** Dragon slayer points of the guild's players, highest first (reference: «Рейтинг драконоборцев»). */
  ranking: readonly { playerId: string; displayName: string; points: number }[];
  /** Dragons the guild has beaten in all lairs. */
  successfulRaids: number;
  /** Players signed up in any dragon raid of the guild. */
  enrolledCount: number;
  viewerEnrolledLair: string | null;
  slayerPoints: number;
  canUpgrade: boolean;
  treasury: { gold: number; silver: number };
  guildLevel: number;
}

export interface GuildDragonParticipantView {
  playerId: string;
  displayName: string;
  photoUrl: string | null;
  damage: number;
  hp: number | null;
  maxHp: number | null;
  alive: boolean;
  slayerPoints: number;
}

export interface GuildDragonBattleView {
  battleId: string;
  battleLog: readonly GuildRaidBattleLogEntry[];
  cardChanges: number;
  dragonActiveCards: readonly [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];
  playerActiveCards: readonly [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];
  playerHp: number;
  playerMaxHp: number;
  status: GuildRaidBattleStatus;
  turnNumber: number;
  version: number;
}

export interface GuildDragonResultView {
  id: string;
  outcome: "won" | "lost";
  completedAt: string;
  leaderName: string | null;
  winner: { playerId: string; displayName: string; card: PlayerMailCardReward; mailId: string | null } | null;
  participants: readonly { playerId: string; displayName: string; damage: number; pointsAfter: number; xp?: number }[];
}

export interface GuildDragonRaidView {
  lair: GuildDragonLairView;
  enrollment: GuildRaidEnrollmentView;
  battle: GuildDragonBattleView | null;
  participants: readonly GuildDragonParticipantView[];
  breathDamage: number;
  nextBreathAt: string | null;
  lastResult: GuildDragonResultView | null;
}

/** The viewer's raid, for the reminder shown on other screens; null when they take part in none. */
export type GuildRaidStatusView = {
  kind: "dragon" | "witches";
  lairCode: string | null;
  name: string;
  level?: number;
  state: "enrolled" | "fighting" | "fallen" | "won" | "lost";
} | null;

export interface GuildDragonActionRequest {
  expectedVersion: number;
  slotIndex: 0 | 1 | 2;
}

export interface GuildAltarUpgradeResponse {
  altar: GuildAltarView;
  baseIncrease: number;
  collectionBonus: number;
  currency: GuildAltarCurrency;
  newLevel: number;
  previousLevel: number;
  totalIncrease: number;
  updatedBalance: { gold: number; silver: number };
}

export interface GuildCardCandidatesResponse {
  cards: readonly PlayerCardInstance[];
}

export interface GuildForumSectionView {
  description: string;
  id: string;
  title: string;
  topicCount: number;
  unreadCount: number;
  visibility: GuildForumVisibility;
}

export interface GuildForumTopicView {
  authorName: string;
  id: string;
  lastPostAt: string;
  locked: boolean;
  pinned: boolean;
  replyCount: number;
  sectionId: string;
  title: string;
  unread: boolean;
}

export interface GuildForumIndexResponse {
  sections: readonly GuildForumSectionView[];
  viewer: { canModerate: boolean; canPost: boolean; isMember: boolean };
}

export interface GuildForumSectionResponse {
  page: number;
  pageSize: number;
  section: GuildForumSectionView;
  topics: readonly GuildForumTopicView[];
  totalPages: number;
  totalTopics: number;
  viewer: { canPost: boolean };
}

export interface GuildForumPostView {
  authorName: string;
  authorRole: GuildRole | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  id: string;
}

export interface GuildForumTopicResponse {
  page: number;
  pageSize: number;
  posts: readonly GuildForumPostView[];
  title: string;
  topic: GuildForumTopicView;
  totalPages: number;
  totalPosts: number;
  viewer: { canModerate: boolean; canReply: boolean };
}

export interface GuildListResponse {
  entries: readonly GuildSummary[];
  page: number;
  pageSize: number;
  totalEntries: number;
  totalPages: number;
}

export interface GuildMineResponse {
  activeApplication: GuildApplicationView | null;
  guild: GuildProfileResponse | null;
  /** Latest application only; do not resurrect an older rejection after a new decision. */
  lastApplication?: {
    guildId: string;
    guildName: string;
    status: "rejected" | "expired";
    retryAt: string | null;
  } | null;
}

export interface CreateGuildRequest {
  description?: string;
  emblemId?: string;
  language?: GuildLanguage;
  minPlayerLevel?: number;
  name: string;
  recruitmentMode?: GuildRecruitmentMode;
  themeElement?: CardElement | null;
}

export interface UpdateGuildSettingsRequest {
  description?: string;
  emblemId?: string;
  language?: GuildLanguage;
  minPlayerLevel?: number;
  recruitmentMode?: GuildRecruitmentMode;
  themeElement?: CardElement | null;
}

export interface GuildApplicationDecisionResponse {
  guild: GuildSummary;
  member: GuildMemberView;
}

export function hasGuildPermission(role: GuildRole | null | undefined, permission: GuildPermission) {
  return role ? GUILD_ROLE_PERMISSIONS[role].includes(permission) : false;
}

export function canManageGuildRole(actorRole: GuildRole, targetRole: GuildRole, nextRole: GuildRole) {
  if (!hasGuildPermission(actorRole, "manage_roles")) return false;
  if (targetRole === "leader" || nextRole === "leader") return false;
  if (actorRole === "officer" && (targetRole === "officer" || nextRole === "officer")) return false;
  return GUILD_ROLE_PRIORITY[actorRole] > GUILD_ROLE_PRIORITY[targetRole]
    && GUILD_ROLE_PRIORITY[actorRole] > GUILD_ROLE_PRIORITY[nextRole];
}

export function canKickGuildMember(actorRole: GuildRole, targetRole: GuildRole) {
  if (!hasGuildPermission(actorRole, "kick_members")) return false;
  if (targetRole === "leader") return false;
  if (actorRole === "officer") return targetRole === "member" || targetRole === "newbie";
  return GUILD_ROLE_PRIORITY[actorRole] > GUILD_ROLE_PRIORITY[targetRole];
}

export function getGuildMemberCapacity(level: number) {
  const safeLevel = Math.max(1, Math.min(GUILD_CONFIG.maxLevel, Math.trunc(level)));
  return GUILD_CONFIG.maxMembersByLevel[safeLevel - 1] ?? GUILD_CONFIG.maxMembersByLevel[0]!;
}

export function getGuildLevelForExperience(experience: number) {
  const safeExperience = Math.max(0, Math.trunc(experience));
  let level = 1;
  for (let index = 1; index < GUILD_CONFIG.levelXpThresholds.length; index += 1) {
    if (safeExperience < GUILD_CONFIG.levelXpThresholds[index]!) break;
    level = index + 1;
  }
  return Math.min(level, GUILD_CONFIG.maxLevel);
}

export function getGuildNextLevelExperience(level: number) {
  return level >= GUILD_CONFIG.maxLevel ? null : GUILD_CONFIG.levelXpThresholds[Math.max(0, Math.trunc(level))] ?? null;
}

export function normalizeGuildName(value: string) {
  const name = value.normalize("NFKC").trim();
  if (Array.from(name).length < GUILD_CONFIG.nameMinLength) throw new Error("guild_name_too_short");
  if (Array.from(name).length > GUILD_CONFIG.nameMaxLength) throw new Error("guild_name_too_long");
  if (/\s{2}/u.test(name)) throw new Error("guild_name_double_space");
  if (!GUILD_NAME_PATTERN.test(name)) throw new Error("guild_name_invalid");
  return name;
}

export function normalizeGuildDescription(value: string | undefined) {
  const description = (value ?? "").normalize("NFKC").trim();
  if (Array.from(description).length > GUILD_CONFIG.descriptionMaxLength) throw new Error("guild_description_too_long");
  return description;
}

export function normalizeGuildNameKey(value: string) {
  return normalizeGuildName(value).toLocaleLowerCase("uk-UA");
}
