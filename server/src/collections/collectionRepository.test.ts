import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { CollectionCardMissingError, CollectionPersistenceError, CollectionRepository } from "./collectionRepository.js";

const cardRow = {
  id: "shop-card", code: "shop_card", description: "Card description", display_name: "Shop card",
  art_key: null, element: "fire", collection_id: null, limited: false, min_rarity: "rare",
  discovered: true, owned_copies: "2", strongest_instance_id: "strongest-copy",
};

function summaryRow(id: string) {
  return {
    id, code: id, display_name: id, cover_art_key: null,
    buff_type: "silver_reward_pct", buff_value: "5", buff_element: null, buff_scope: null,
    bonus_label: "+5% silver", source: "standard", total_cards: "4", discovered_cards: "1", completed_at: null,
  };
}

test("shop preview reads real ownership and only the card's collections", async () => {
  const queries: Array<{ sql: string; parameters: unknown[] }> = [];
  const pool = {
    query: async (sql: string, parameters: unknown[]) => {
      queries.push({ sql, parameters });
      return { rows: queries.length === 1 ? [cardRow] : [summaryRow("first"), summaryRow("second")] };
    },
  } as unknown as Pool;
  const result = await new CollectionRepository(pool).previewCard("player", cardRow.id);
  assert.equal(result.card.ownedCopies, 2);
  assert.equal(result.card.strongestInstanceId, "strongest-copy");
  assert.equal(result.card.collectionId, null);
  assert.equal(result.card.discovered, true);
  assert.deepEqual(result.collections.map(({ id }) => id), ["first", "second"]);
  assert.equal(result.collections[0]?.bonusLabel, "+5% silver");
  assert.deepEqual(queries[0]?.parameters.slice(2), [null, cardRow.id]);
  assert.deepEqual(queries[1]?.parameters, ["player", cardRow.id]);
  assert.match(queries[1]!.sql, /WHERE EXISTS/);
  assert.match(queries[1]!.sql, /card_membership\.card_id = \$2/);
});

test("shop preview supports undiscovered cards without collections", async () => {
  let calls = 0;
  const pool = {
    query: async () => ({ rows: ++calls === 1 ? [{ ...cardRow, discovered: false, owned_copies: "0", strongest_instance_id: null }] : [] }),
  } as unknown as Pool;
  const result = await new CollectionRepository(pool).previewCard("player", cardRow.id);
  assert.equal(result.card.discovered, false);
  assert.equal(result.card.ownedCopies, 0);
  assert.deepEqual(result.collections, []);
});

test("shop preview reports a missing card before requesting collections", async () => {
  let calls = 0;
  const pool = { query: async () => { calls += 1; return { rows: [] }; } } as unknown as Pool;
  await assert.rejects(new CollectionRepository(pool).previewCard("player", "missing"), CollectionCardMissingError);
  assert.equal(calls, 1);
});

test("shop preview maps storage failures to the repository availability error", async () => {
  const pool = { query: async () => { throw new Error("Database offline"); } } as unknown as Pool;
  await assert.rejects(new CollectionRepository(pool).previewCard("player", cardRow.id), CollectionPersistenceError);
});
