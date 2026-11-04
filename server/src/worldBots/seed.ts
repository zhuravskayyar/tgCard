import { pool, worldBots } from "../index.js";

try {
  await worldBots.ensureWorld();
  console.log("Seeded the Cardastika world bots and guilds.");
} finally {
  await pool.end();
}
