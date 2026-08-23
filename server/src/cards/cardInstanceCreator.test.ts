import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { createStandardCardInstance } from "./cardInstanceCreator.js";

test("server creation persists one independent instance with an injected bounded bonus", async () => {
  const writes: unknown[][] = [];
  const client = {
    query: async (_text: string, values: unknown[]) => {
      writes.push(values);
      return { rowCount: 1, rows: [] };
    },
  } as unknown as PoolClient;
  const instance = await createStandardCardInstance(client, "player-1", {
    id: "starter_02",
    code: "starter_02",
    displayName: "Лис",
    artKey: null,
    element: "fire",
    collectionId: null,
  }, 1, { nextInt: (maximum) => maximum - 1 });

  assert.equal(instance.level, 1);
  assert.equal(instance.basePower, 10);
  assert.equal(instance.bonusPower, 2);
  assert.equal(instance.finalPower, 12);
  assert.equal(instance.rarity, "common");
  assert.equal(typeof instance.instanceId, "string");
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0]?.slice(1), ["player-1", "starter_02", 1, 2]);
});
