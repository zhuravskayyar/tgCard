# Release of migration 068 (catalog v2) with a full player reset, then the catalog seed.
# Run from the repository root. -Local rehearses on the local database from the user environment.
# Production: the connection string stays in this process only.
param([switch]$Local)
$ErrorActionPreference = "Stop"

if ($Local) {
  $env:DATABASE_URL = [Environment]::GetEnvironmentVariable("DATABASE_URL", "User")
  if ($env:DATABASE_URL -notmatch "@(127\.0\.0\.1|localhost)[:/]") { throw "Stopped: -Local needs a localhost DATABASE_URL." }
} else {
  $secure = Read-Host "Neon direct (unpooled) connection string" -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $answer = Read-Host "Did you create a backup branch of production in the Neon console? (yes/no)"
  if ($answer -ne "yes") { throw "Stopped: no backup." }
}

try {
  # 068 is the only migration allowed to be pending: 064 must not run by accident.
  $check = @'
const { Client } = require("pg");
const { readdirSync } = require("fs");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const applied = new Set((await c.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  await c.end();
  const pending = readdirSync("migrations").filter((n) => /^\d+_.+\.sql$/.test(n) && !applied.has(n));
  console.log("Pending:", pending.join(", ") || "none");
  if (pending.some((n) => n !== "068_reference_collection_catalog.sql")) process.exit(2);
})().catch((e) => { console.error(e.message); process.exit(1); });
'@
  $reset = @'
const { Client } = require("pg");
const { readFileSync } = require("fs");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query(readFileSync("../scripts/release-068-reset.sql", "utf8"));
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  const r = await c.query("SELECT (SELECT count(*) FROM players) players, (SELECT count(*) FROM player_card_instances) cards, (SELECT count(*) FROM deck_slots) slots");
  console.log("After reset:", r.rows[0]);
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
'@
  $summary = @'
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query("SELECT (SELECT max(name) FROM schema_migrations) migration, (SELECT count(*) FROM cards) cards, (SELECT count(*) FROM collections) collections, (SELECT count(*) FROM collection_cards) members, (SELECT count(*) FROM players) players, (SELECT count(*) FROM player_card_instances) owned, (SELECT count(*) FROM deck_slots) slots, (SELECT count(*) FROM players WHERE level <> 1 OR silver <> 0 OR gold <> 0) not_reset");
  console.log("Final:", r.rows[0]);
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
'@
  Push-Location server
  try {
    # The local database already has 068 and keeps 064/065 unapplied on purpose, so -Local skips migrating.
    if (-not $Local) {
      $check | node -
      if ($LASTEXITCODE -ne 0) { throw "Stopped: unexpected pending migrations, nothing was changed." }
      npm run migrate
      if ($LASTEXITCODE -ne 0) { throw "Migration failed" }
    }
    $reset | node -
    if ($LASTEXITCODE -ne 0) { throw "Reset failed (rolled back)" }
    npm run seed
    if ($LASTEXITCODE -ne 0) { throw "Seed failed" }
    $summary | node -
  } finally { Pop-Location }
  Write-Host "Done."
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
