import { randomInt, randomUUID } from "node:crypto";
import {
  generateStandardBonusPower,
  getBasePowerForLevel,
  getCardPower,
  getRarityForLevel,
  type IntegerRandomSource,
} from "@cardastika/game-core";
import type { CardDefinition, PlayerCardInstance } from "@cardastika/shared";
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
