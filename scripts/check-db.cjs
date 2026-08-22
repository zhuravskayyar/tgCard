const { Client } = require("pg");

async function checkDatabase() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let connected = false;

  try {
    await client.connect();
    connected = true;
    await client.query("SELECT 1");
  } catch {
    console.error("PostgreSQL connection check failed.");
    process.exitCode = 1;
  } finally {
    if (connected) {
      await client.end();
    }
  }
}

void checkDatabase();
