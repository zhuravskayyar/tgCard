import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { recordCardDiscovery } from "./discoveryService.js";

test("first discovery completes the final missing collection card exactly once", async () => {
  const responses = [
    { rowCount: 1, rows: [{ card_id: "predators_06" }] },
    { rowCount: 1, rows: [{ collection_id: "collection_predators" }] },
    { rowCount: 1, rows: [{ total: "6", discovered: "6" }] },
    { rowCount: 1, rows: [{ collection_id: "collection_predators" }] },
    { rowCount: 1, rows: [{ id: "collection_predators", display_name: "Хижаки", buff_type: "battle_damage_pct", buff_value: 3, buff_element: null, bonus_label: "+3% шкоди" }] },
  ];
  const database = { query: async () => responses.shift()! } as unknown as PoolClient;
  const result = await recordCardDiscovery(database, "player", "predators_06");
  assert.equal(result.newDiscovery, true);
  assert.equal(result.collectionCompleted?.name, "Хижаки");
  assert.deepEqual(result.collectionCompleted?.bonus, { type: "battle_damage_pct", value: 3 });
});
test("duplicate acquisition is idempotent and does not repeat completion", async () => {
  let queries = 0;
  const database = { query: async () => { queries += 1; return { rowCount: 0, rows: [] }; } } as unknown as PoolClient;
  assert.deepEqual(await recordCardDiscovery(database, "player", "predators_06"), { newDiscovery: false });
  assert.equal(queries, 1);
});
