import { randomInt, randomUUID } from "node:crypto";
import {
  generateStandardBonusPower,
  getBasePowerForLevel,
  getCardPower,
  getRarityForLevel,
  MAGIC_SOURCE_CARD_CODES,
  type IntegerRandomSource,
} from "@cardastika/game-core";
import type { CardDefinition, CardElement, PlayerCardInstance } from "@cardastika/shared";
import type { PoolClient } from "pg";

export class CryptoCardRandomSource implements IntegerRandomSource {
  nextInt(maxExclusive: number) {
    return randomInt(maxExclusive);
  }
}

export async function createStandardCardInstance(
  client: Pick<PoolClient, "query">,
  playerId: string,
  definition: CardDefinition,
  level: number,
  rng: IntegerRandomSource,
): Promise<PlayerCardInstance> {
  const basePower = getBasePowerForLevel(level);
  const bonusPower = generateStandardBonusPower(basePower, rng);
  const instanceId = randomUUID();
  const result = await client.query(
    `
      INSERT INTO player_card_instances (id, player_id, card_id, level, bonus_power)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [instanceId, playerId, definition.id, level, bonusPower],
  );
  if (result.rowCount !== 1) throw new Error("Card instance creation affected an unexpected row count");

  return {
    instanceId,
    cardId: definition.id,
    code: definition.code,
    displayName: definition.displayName,
    artKey: definition.artKey,
    element: definition.element,
    level,
    levelProgressElements: 0,
    limited: definition.limited ?? false,
    protectedFromAbsorption: false,
    basePower,
    bonusPower,
    finalPower: getCardPower({ level, bonusPower }),
    rarity: getRarityForLevel(level),
    storedElements: 0,
    collectionId: definition.collectionId,
  };
}

/**
 * Grants a magic source: an instance of the element's `el_*` card at the given level, without bonus
 * power (a source always has power 1). Its elemental potential is the full native value of that level.
 */
export async function createMagicSourceInstance(
  client: Pick<PoolClient, "query">,
  playerId: string,
  element: CardElement,
  level: number,
): Promise<{ instanceId: string; displayName: string }> {
  const code = MAGIC_SOURCE_CARD_CODES[element];
  const card = (await client.query<{ id: string; display_name: string | null }>(
    "SELECT id, display_name FROM cards WHERE code = $1",
    [code],
  )).rows[0];
  if (!card) throw new Error(`Magic source card ${code} is missing from the catalog`);
  const instanceId = randomUUID();
  const result = await client.query(
    "INSERT INTO player_card_instances (id, player_id, card_id, level, bonus_power) VALUES ($1, $2, $3, $4, 0)",
    [instanceId, playerId, card.id, level],
  );
  if (result.rowCount !== 1) throw new Error("Magic source creation affected an unexpected row count");
  return { instanceId, displayName: card.display_name ?? code };
}
