import { getUpgradeProgress, MAX_CARD_LEVEL } from "@cardastika/game-core";
import type { GuildProfileResponse } from "@cardastika/shared";

/** Share of the current guild level already earned, 0..1; a guild at the top level is full. */
export function getGuildExperienceShare(guild: GuildProfileResponse["guild"]) {
  if (!guild.nextLevelExperience) return 1;
  return Math.max(0, Math.min(1, guild.experience / guild.nextLevelExperience));
}

export interface GuildCardHubStatus {
  level: number;
  /** Level progress 0..100. */
  percent: number;
  atMaximum: boolean;
  /** The viewer may press «Підняти рівень» right now. */
  readyToLevelUp: boolean;
  /** The next level is gold: raising it gifts every member a magic source. */
  nextIsGold: boolean;
  targetLevel: number | null;
}

/** What the hub shows about the Guild Card; the server's progression wins over the local table. */
export function getGuildCardHubStatus(guildCard: GuildProfileResponse["guildCard"]): GuildCardHubStatus | null {
  const active = guildCard.active;
  if (!active) return null;
  const atMaximum = active.level >= MAX_CARD_LEVEL;
  const progression = guildCard.progression;
  const percent = atMaximum ? 100 : progression?.percent ?? getUpgradeProgress(active.levelProgressElements, active.level).percent;
  return {
    level: active.level,
    percent,
    atMaximum,
    readyToLevelUp: !atMaximum && guildCard.canLevelUp && progression?.availability === "ready",
    nextIsGold: !atMaximum && Boolean(progression?.isGoldLevel),
    targetLevel: atMaximum ? null : progression?.targetLevel ?? active.level + 1,
  };
}

/** Hours until the viewer may contribute to the treasury again, or 0 when it is open now. */
export function getTreasuryWaitHours(viewer: GuildProfileResponse["treasury"]["viewer"], now = Date.now()) {
  if (viewer.canContribute) return 0;
  return Math.max(0, Math.ceil((Date.parse(viewer.contributionAvailableAt) - now) / 3_600_000));
}
