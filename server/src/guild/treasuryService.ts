import { randomUUID } from "node:crypto";
import {
  applyAbsorptionEfficiency,
  applyElementalPotential,
  getPlayerCollectionModifiers,
  getTransferableElementValue,
} from "@cardastika/game-core";
import {
  GUILD_CONFIG,
  getPlayerDisplayName,
  type GuildRole,
  type GuildTreasuryCardCandidatesResponse,
  type GuildTreasuryCurrency,
  type GuildTreasuryMemberView,
  type GuildTreasuryView,
  type PlayerCardInstance,
} from "@cardastika/shared";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getCompletedCollectionModifiers } from "../collections/discoveryService.js";
import { mapCardInstanceRow, type CardInstanceProjectionRow } from "../cards/cardInstanceMapper.js";

type Queryable = Pick<Pool, "query">;
type TransactionClient = Pick<PoolClient, "query">;

interface TreasuryMemberRow extends QueryResultRow {
  card_elements: string | number;
  contributed_gold: string | number;
  contributed_silver: string | number;
  contributed_xp: string | number;
  first_name: string;
  gold: string | number;
  joined_at: string | Date;
  last_name: string | null;
  level: number;
  nickname: string | null;
  photo_url: string | null;
  player_id: string;
  role: GuildRole;
  silver: string | number;
  username: string | null;
}

interface TreasuryCardRow extends CardInstanceProjectionRow {
  player_id?: string;
}

interface TreasuryPlayerRow {
  gold: string | number;
  silver: string | number;
}

const CARD_PROJECTION = `
  player_card_instances.id AS instance_id,
  player_card_instances.player_id,
  cards.id AS card_id,
  cards.code,
  cards.display_name,
  cards.art_key,
  cards.element,
  player_card_instances.level,
  player_card_instances.bonus_power,
  player_card_instances.level_progress_elements,
  player_card_instances.protected_from_absorption,
  player_card_instances.stored_elements,
  cards.collection_id,
  cards.limited
`;

const GUILD_CARD_PROJECTION = `
  guild_cards.id AS instance_id,
  guild_cards.card_id,
  cards.code,
  cards.display_name,
  cards.art_key,
  cards.element,
  guild_cards.level,
  guild_cards.bonus_power,
  guild_cards.level_progress_elements,
  guild_cards.stored_elements,
  cards.collection_id,
  cards.limited
`;

function toNonNegativeInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field} returned by database`);
  return parsed;
}

function toProgressNumber(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  const rounded = Math.round(parsed * 100);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isSafeInteger(rounded) || Math.abs(parsed - rounded / 100) > 1e-9) {
    throw new Error(`Invalid ${field} returned by database`);
  }
  return parsed;
}

function toDateString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function contributionAvailableAt(joinedAt: string | Date, role?: GuildRole) {
  if (role === "leader") return new Date(0);
  return new Date(new Date(joinedAt).getTime() + GUILD_CONFIG.treasuryContributionUnlockHours * 60 * 60 * 1000);
}

function assertDonationAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new GuildTreasuryDomainError("treasury_invalid_amount", "Donation amount must be a positive integer", 400);
  }
}

function assertFodderIds(ids: readonly string[]) {
  if (ids.length < 1 || ids.length > 100 || ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new GuildTreasuryDomainError("treasury_invalid_cards", "Card donation must contain unique card instances", 400);
  }
}

export type GuildTreasuryErrorCode =
  | "treasury_card_different_element"
  | "treasury_card_in_deck"
  | "treasury_card_not_owned"
  | "treasury_card_not_selected"
  | "treasury_card_protected"
  | "treasury_cooldown"
  | "treasury_insufficient_gold"
  | "treasury_insufficient_silver"
  | "treasury_invalid_amount"
  | "treasury_invalid_cards"
  | "treasury_not_member";

export class GuildTreasuryDomainError extends Error {
  constructor(
    public readonly code: GuildTreasuryErrorCode,
    message: string,
    public readonly status = 409,
    public readonly retryAt?: string,
  ) {
    super(message);
    this.name = "GuildTreasuryDomainError";
  }
}

export class GuildTreasuryPersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Guild treasury persistence is unavailable", options);
    this.name = "GuildTreasuryPersistenceError";
  }
}

export class GuildTreasuryService {
  constructor(private readonly pool: Pick<Pool, "connect" | "query">) {}

  async getView(database: Queryable, viewerId: string, guildId: string): Promise<GuildTreasuryView> {
    const [balanceResult, membersResult, viewerResult] = await Promise.all([
      database.query<{ gold: string | number; silver: string | number }>(
        "SELECT gold, silver FROM guild_treasuries WHERE guild_id = $1",
        [guildId],
      ),
      database.query<TreasuryMemberRow>(
        `
          SELECT gm.player_id, gm.role, gm.joined_at,
            p.username, p.nickname, p.first_name, p.last_name, p.photo_url, p.level,
            p.gold, p.silver, gm.contributed_xp,
            COALESCE(SUM(c.amount) FILTER (WHERE c.contribution_type = 'gold'), 0)::numeric AS contributed_gold,
            COALESCE(SUM(c.amount) FILTER (WHERE c.contribution_type = 'silver'), 0)::numeric AS contributed_silver,
            COALESCE(SUM(c.amount) FILTER (WHERE c.contribution_type = 'card_elements'), 0)::numeric AS card_elements
          FROM guild_members gm
          INNER JOIN players p ON p.id = gm.player_id
          LEFT JOIN guild_treasury_contributions c
            ON c.guild_id = gm.guild_id AND c.player_id = gm.player_id
          WHERE gm.guild_id = $1
          GROUP BY gm.player_id, gm.role, gm.joined_at, p.username, p.nickname, p.first_name,
            p.last_name, p.photo_url, p.level, p.gold, p.silver, gm.contributed_xp
          ORDER BY CASE gm.role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 WHEN 'veteran' THEN 2 WHEN 'member' THEN 3 ELSE 4 END,
            gm.joined_at ASC, gm.player_id ASC
        `,
        [guildId],
      ),
      database.query<TreasuryMemberRow>(
        `
          SELECT gm.player_id, gm.role, gm.joined_at,
            p.username, p.nickname, p.first_name, p.last_name, p.photo_url, p.level,
            p.gold, p.silver, gm.contributed_xp,
            0::numeric AS contributed_gold, 0::numeric AS contributed_silver, 0::numeric AS card_elements
          FROM guild_members gm
          INNER JOIN players p ON p.id = gm.player_id
          WHERE gm.guild_id = $1 AND gm.player_id = $2
        `,
        [guildId, viewerId],
      ),
    ]);

    const viewer = viewerResult.rows[0];
    const availableAt = viewer ? contributionAvailableAt(viewer.joined_at, viewer.role) : new Date();
    const viewerIsMember = Boolean(viewer);
    const viewerGold = viewer ? toNonNegativeInteger(viewer.gold, "player gold") : 0;
    const viewerSilver = viewer ? toNonNegativeInteger(viewer.silver, "player silver") : 0;
    const members: GuildTreasuryMemberView[] = membersResult.rows.map((row) => this.toMemberView(row));

    return {
      balance: {
        gold: toNonNegativeInteger(balanceResult.rows[0]?.gold ?? 0, "guild treasury gold"),
        silver: toNonNegativeInteger(balanceResult.rows[0]?.silver ?? 0, "guild treasury silver"),
      },
      members,
      viewer: {
        canContribute: viewerIsMember && Date.now() >= availableAt.getTime(),
        contributionAvailableAt: availableAt.toISOString(),
        gold: viewerGold,
        silver: viewerSilver,
      },
    };
  }

  async getCardCandidates(playerId: string, guildId: string): Promise<GuildTreasuryCardCandidatesResponse> {
    try {
      const memberResult = await this.pool.query<{ joined_at: string | Date; role: GuildRole }>(
        "SELECT joined_at, role FROM guild_members WHERE player_id = $1 AND guild_id = $2",
        [playerId, guildId],
      );
      const member = memberResult.rows[0];
      if (!member) throw new GuildTreasuryDomainError("treasury_not_member", "Player is not a member of this guild", 403);
      const availableAt = contributionAvailableAt(member.joined_at, member.role);
      if (Date.now() < availableAt.getTime()) {
        throw new GuildTreasuryDomainError("treasury_cooldown", "Treasury contributions unlock after three days in the guild", 409, availableAt.toISOString());
      }
      const result = await this.pool.query<TreasuryCardRow>(
        `
          SELECT ${CARD_PROJECTION}
          FROM player_card_instances
          INNER JOIN cards ON cards.id = player_card_instances.card_id
          INNER JOIN guild_cards ON guild_cards.guild_id = $2 AND guild_cards.card_id IS NOT NULL
            AND cards.element = (SELECT element FROM cards WHERE id = guild_cards.card_id)
          WHERE player_card_instances.player_id = $1
            AND player_card_instances.protected_from_absorption = FALSE
            AND NOT EXISTS (
              SELECT 1 FROM player_decks
              INNER JOIN deck_slots ON deck_slots.deck_id = player_decks.id
              WHERE player_decks.player_id = $1 AND deck_slots.card_instance_id = player_card_instances.id
            )
          ORDER BY player_card_instances.level ASC, player_card_instances.bonus_power ASC,
            player_card_instances.created_at ASC, player_card_instances.id ASC
          LIMIT 100
        `,
        [playerId, guildId],
      );
      return { cards: result.rows.map(mapCardInstanceRow) };
    } catch (error) {
      if (error instanceof GuildTreasuryDomainError) throw error;
      throw new GuildTreasuryPersistenceError({ cause: error });
    }
  }

  async donateCurrency(playerId: string, guildId: string, currency: GuildTreasuryCurrency, amount: number) {
    assertDonationAmount(amount);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.lockEligibleMember(client, playerId, guildId);
      const playerResult = await client.query<TreasuryPlayerRow>(
        "SELECT gold, silver FROM players WHERE id = $1 FOR UPDATE",
        [playerId],
      );
      const player = playerResult.rows[0];
      if (!player) throw new GuildTreasuryDomainError("treasury_not_member", "Player is not a member of this guild", 403);
      const balance = toNonNegativeInteger(player[currency], `player ${currency}`);
      if (balance < amount) {
        throw new GuildTreasuryDomainError(
          currency === "gold" ? "treasury_insufficient_gold" : "treasury_insufficient_silver",
          `Not enough ${currency} for this donation`,
        );
      }

      await client.query(
        "INSERT INTO guild_treasuries (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING",
        [guildId],
      );
      await client.query("SELECT guild_id FROM guild_treasuries WHERE guild_id = $1 FOR UPDATE", [guildId]);
      const updatedPlayer = await client.query<TreasuryPlayerRow>(
        `UPDATE players SET ${currency} = ${currency} - $2, updated_at = NOW()
         WHERE id = $1 AND ${currency} >= $2 RETURNING gold, silver`,
        [playerId, amount],
      );
      if (!updatedPlayer.rows[0]) {
        throw new GuildTreasuryDomainError(
          currency === "gold" ? "treasury_insufficient_gold" : "treasury_insufficient_silver",
          `Not enough ${currency} for this donation`,
        );
      }
      await client.query(
        `UPDATE guild_treasuries SET ${currency} = ${currency} + $2, updated_at = NOW() WHERE guild_id = $1`,
        [guildId, amount],
      );
      await client.query(
        `INSERT INTO guild_treasury_contributions (id, guild_id, player_id, contribution_type, amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), guildId, playerId, currency, amount],
      );
      await client.query("COMMIT");
      return { amount, currency };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildTreasuryDomainError) throw error;
      throw new GuildTreasuryPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async donateCardElements(playerId: string, guildId: string, fodderInstanceIds: readonly string[]) {
    assertFodderIds(fodderInstanceIds);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.lockEligibleMember(client, playerId, guildId);
      const targetResult = await client.query<TreasuryCardRow>(
        `SELECT ${GUILD_CARD_PROJECTION}
         FROM guild_cards
         INNER JOIN cards ON cards.id = guild_cards.card_id
         WHERE guild_cards.guild_id = $1
         FOR UPDATE OF guild_cards`,
        [guildId],
      );
      const target = targetResult.rows[0];
      if (!target) throw new GuildTreasuryDomainError("treasury_card_not_selected", "The guild leader has not selected a Guild Card yet");

      const fodderResult = await client.query<TreasuryCardRow>(
        `SELECT ${CARD_PROJECTION}
         FROM player_card_instances
         INNER JOIN cards ON cards.id = player_card_instances.card_id
         WHERE player_card_instances.player_id = $1
           AND player_card_instances.id = ANY($2::uuid[])
         ORDER BY player_card_instances.id
         FOR UPDATE OF player_card_instances`,
        [playerId, fodderInstanceIds],
      );
      const fodderById = new Map(fodderResult.rows.map((row) => [row.instance_id, row]));
      const fodder = fodderInstanceIds.map((id) => {
        const row = fodderById.get(id);
        if (!row) throw new GuildTreasuryDomainError("treasury_card_not_owned", "A donated card is no longer owned by this player", 403);
        if (row.protected_from_absorption) throw new GuildTreasuryDomainError("treasury_card_protected", "A protected card cannot be donated");
        if (row.element !== target.element) throw new GuildTreasuryDomainError("treasury_card_different_element", "Only cards of the Guild Card element can be donated");
        return row;
      });
      const activeDeckResult = await client.query<{ card_instance_id: string }>(
        `SELECT deck_slots.card_instance_id
         FROM player_decks
         INNER JOIN deck_slots ON deck_slots.deck_id = player_decks.id
         WHERE player_decks.player_id = $1 AND deck_slots.card_instance_id = ANY($2::uuid[])`,
        [playerId, fodderInstanceIds],
      );
      if (activeDeckResult.rows.length) throw new GuildTreasuryDomainError("treasury_card_in_deck", "Cards from the active deck cannot be donated");

      const baseElements = fodder.reduce((total, row) => total + getTransferableElementValue({
        level: toNonNegativeInteger(row.level, "fodder level"),
        levelProgressElements: toProgressNumber(row.level_progress_elements, "fodder progress"),
        storedElements: toProgressNumber(row.stored_elements, "fodder stored elements"),
      }), 0);
      const modifiers = getPlayerCollectionModifiers(await getCompletedCollectionModifiers(client, playerId));
      const addedElements = applyAbsorptionEfficiency(baseElements, modifiers);
      const afterState = applyElementalPotential({
        level: toNonNegativeInteger(target.level, "Guild Card level"),
        levelProgressElements: toProgressNumber(target.level_progress_elements, "Guild Card progress"),
        storedElements: toProgressNumber(target.stored_elements, "Guild Card stored elements"),
      }, addedElements);

      await client.query(
        `UPDATE guild_cards
         SET level_progress_elements = $2, stored_elements = $3, updated_at = NOW()
         WHERE guild_id = $1`,
        [guildId, afterState.levelProgressElements, afterState.storedElements],
      );
      await client.query("DELETE FROM player_card_instances WHERE id = ANY($1::uuid[])", [fodderInstanceIds]);
      await client.query(
        `INSERT INTO guild_treasury_contributions (id, guild_id, player_id, contribution_type, amount)
         VALUES ($1, $2, $3, 'card_elements', $4)`,
        [randomUUID(), guildId, playerId, addedElements],
      );
      await client.query("COMMIT");
      return { addedElements, consumedInstanceIds: [...fodderInstanceIds] };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildTreasuryDomainError) throw error;
      throw new GuildTreasuryPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  private toMemberView(row: TreasuryMemberRow): GuildTreasuryMemberView {
    return {
      cardElements: toProgressNumber(row.card_elements, "member card elements"),
      contributedGold: toNonNegativeInteger(row.contributed_gold, "member gold contribution"),
      contributedSilver: toNonNegativeInteger(row.contributed_silver, "member silver contribution"),
      contributedXp: toNonNegativeInteger(row.contributed_xp, "member guild XP"),
      displayName: getPlayerDisplayName({ firstName: row.first_name, nickname: row.nickname, username: row.username }),
      joinedAt: toDateString(row.joined_at),
      playerId: row.player_id,
      role: row.role,
    };
  }

  private async lockEligibleMember(client: TransactionClient, playerId: string, guildId: string) {
    const result = await client.query<{ joined_at: string | Date; role: GuildRole }>(
      "SELECT joined_at, role FROM guild_members WHERE player_id = $1 AND guild_id = $2 FOR UPDATE",
      [playerId, guildId],
    );
    const member = result.rows[0];
    if (!member) throw new GuildTreasuryDomainError("treasury_not_member", "Player is not a member of this guild", 403);
    const availableAt = contributionAvailableAt(member.joined_at, member.role);
    if (Date.now() < availableAt.getTime()) {
      throw new GuildTreasuryDomainError("treasury_cooldown", "Treasury contributions unlock after three days in the guild", 409, availableAt.toISOString());
    }
    return member;
  }
}
