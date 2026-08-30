import { Pool } from "pg";
import { recalculateAllAutomaticDecks } from "../decks/automaticDeckService.js";
import { backfillStarterCards } from "../inventory/starterCardGrant.js";
import { backfillCardDiscoveries } from "../collections/discoveryService.js";
import {
  STARTER_CARD_CONTENT_SEED_NAME,
  STARTER_CARD_SEED_NAME,
  seedStarterCardDefinitions,
} from "./starterCardSeed.js";
import { seedCollectionDefinitions } from "./collectionSeed.js";
import { seedLimitedCardDefinition } from "./limitedCardSeed.js";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run seeds");
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await seedStarterCardDefinitions(client);
    await seedLimitedCardDefinition(client);
    for (const seedName of [STARTER_CARD_SEED_NAME, STARTER_CARD_CONTENT_SEED_NAME]) {
      const applied = await client.query(
        "SELECT 1 FROM schema_seeds WHERE name = $1",
        [seedName],
      );

      if (!applied.rowCount) {
        await client.query("INSERT INTO schema_seeds (name) VALUES ($1)", [seedName]);
      }
    }

    const catalog = await seedCollectionDefinitions(client);
    console.log(`Collection catalog validated: ${catalog.cardCount} cards; elements ${JSON.stringify(catalog.elementCounts)}`);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const grantedRows = await backfillStarterCards(pool);
  const discoverySummary = await backfillCardDiscoveries(pool);
  const deckSummary = await recalculateAllAutomaticDecks(pool);
  console.log(
    `Canonical data ready; ownership rows added: ${grantedRows}; discoveries added: ${discoverySummary.discoveries}; collection completions added: ${discoverySummary.completions}; automatic decks updated: ${deckSummary.updated}; unchanged: ${deckSummary.unchanged}; insufficient: ${deckSummary.insufficientValidCards}`,
  );
} finally {
  await pool.end();
}
