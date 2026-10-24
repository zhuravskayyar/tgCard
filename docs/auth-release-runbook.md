# Guest auth release runbook

This runbook covers migration `061_guest_auth_abuse_controls.sql`. It adds a
database-backed guest creation limit and records which verified provider
identity claimed the account-link reward. The migration is additive; older
application code can run against the migrated schema.

Guest creation is limited to 5 attempts per hour and 20 per day for one client
network. IPv6 addresses share a `/64` quota. The server stores an HMAC of the
normalized address, never the address itself, and deletes counters inactive for
more than seven days. On Vercel, the server reads `X-Forwarded-For`, which Vercel
overwrites with the client IP. Outside Vercel, it ignores forwarding headers and
uses the socket address. These limits stop bursts from one network; distributed
clients or rotating proxy networks can bypass them, so use an edge challenge or
firewall rule if abuse warrants that stronger layer. See [Vercel's request-header documentation](https://vercel.com/docs/headers/request-headers).

The link reward remains once per player and is also unique to the verified
provider subject (Telegram user ID or Google `sub`). The migration associates
existing reward rows with each player's earliest linked identity. Separate
provider accounts cannot be reliably recognized as the same human, so this
does not prevent someone from using multiple distinct Google or Telegram
accounts.

## Local rehearsal

1. Start the local PostgreSQL database with `npm run dev:db`.
2. Run `npm run migrate --workspace server` with the local `DATABASE_URL`.
3. Verify `schema_migrations` contains
   `061_guest_auth_abuse_controls.sql` and run the auth integration tests.
4. Keep the production connection string out of shell history, logs, and
   committed files.

## Production backup and migration

Use Neon’s direct/unpooled connection string for `pg_dump`, `pg_restore`, and
the migration. Do not run these commands until the release is approved.

```powershell
$secureConnectionString = Read-Host "Neon direct connection string" -AsSecureString
$connectionStringPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureConnectionString)
try {
  $env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($connectionStringPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($connectionStringPointer)
}
pg_dump -Fc --no-owner --no-privileges -d $env:DATABASE_URL -f cardastika-pre-061.dump
pg_restore -l cardastika-pre-061.dump
Get-FileHash cardastika-pre-061.dump -Algorithm SHA256
npm run migrate --workspace server
```

Before releasing the application, verify the migration marker and schema:

```sql
SELECT name FROM schema_migrations
WHERE name = '061_guest_auth_abuse_controls.sql';

SELECT to_regclass('public.guest_creation_rate_limits') AS guest_rate_limits,
       to_regclass('public.player_account_link_rewards_identity_idx') AS reward_identity_index;
```

For a rehearsal, restore the backup into a separate disposable database, then
run the migration against that database and execute the auth integration
tests. Confirm the backup is readable with `pg_restore -l`; a successful dump
command alone is not enough.

## Rollback

If the application release needs to be rolled back, restore the previous
application deployment and leave migration 061 in place. The new table is
unused by the old code, and its added reward identity columns remain nullable.
This avoids discarding valid reward records or guest limit counters.

If the database itself must be rolled back, stop application writes and restore
the verified pre-061 dump into a separate database first. Validate that
database, then point the application at it through the normal approved release
process. Do not drop the production rate-limit table or reward identity columns
as an emergency rollback; restoring a verified backup is safer and preserves
an auditable recovery point.
