import { Pool } from "pg";
import { backfillStarterDecks } from "../decks/starterDeck.js";
import { backfillStarterCards } from "../inventory/starterCardGrant.js";
import { STARTER_CARD_SEED_NAME, seedStarterCardDefinitions } from "./starterCardSeed.js";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run seeds");
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const applied = await client.query(
      "SELECT 1 FROM schema_seeds WHERE name = $1",
      [STARTER_CARD_SEED_NAME],
    );

    if (!applied.rowCount) {
      await seedStarterCardDefinitions(client);
      await client.query("INSERT INTO schema_seeds (name) VALUES ($1)", [STARTER_CARD_SEED_NAME]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const grantedRows = await backfillStarterCards(pool);
  const createdDecks = await backfillStarterDecks(pool);
  console.log(`Starter data ready; ownership rows added: ${grantedRows}; decks added: ${createdDecks}`);
} finally {
  await pool.end();
}
