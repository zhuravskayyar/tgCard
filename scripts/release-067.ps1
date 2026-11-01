# Production release of migration 067 (arena rating scale).
# Run from the repository root. The connection string stays in this process only.
$ErrorActionPreference = "Stop"

$secure = Read-Host "Neon direct (unpooled) connection string" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }

try {
  if (Get-Command pg_dump -ErrorAction SilentlyContinue) {
    $dump = "cardastika-pre-067-$(Get-Date -Format yyyyMMdd-HHmm).dump"
    pg_dump -Fc --no-owner --no-privileges -d $env:DATABASE_URL -f $dump
    if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
    pg_restore -l $dump | Select-Object -First 3
    Write-Host "Backup: $dump"
  } else {
    $answer = Read-Host "pg_dump not found. Did you create a backup branch in the Neon console? (yes/no)"
    if ($answer -ne "yes") { throw "Stopped: no backup." }
  }

  # Stop unless 067 is the only pending migration: 064 resets player progress and must not run by accident.
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
  if (pending.some((n) => n !== "067_arena_own_league_rating.sql")) process.exit(2);
})().catch((e) => { console.error(e.message); process.exit(1); });
'@
  Push-Location server
  try {
    $check | node -
    if ($LASTEXITCODE -ne 0) { throw "Stopped: unexpected pending migrations, nothing was changed." }
    npm run migrate
    if ($LASTEXITCODE -ne 0) { throw "Migration failed" }
  } finally { Pop-Location }
  Write-Host "Done."
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
