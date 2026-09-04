# Production deployment: Vercel + Neon

The production target is:

```text
GitHub -> Vercel (client + /api) -> Neon PostgreSQL
```

The local Vite proxy, WSL PostgreSQL, and Cloudflare tunnel remain available
for development only. Production browser requests use the same-origin `/api`
path, so `VITE_API_URL` should be unset or empty in Vercel.

## 1. Create Neon and move the database

1. Create a Neon project and database.
2. Copy both connection strings from Neon’s **Connect** dialog. The runtime
   string should include `sslmode=require` (and normally
   `channel_binding=require`) and use the `-pooler` endpoint. Use the direct
   (unpooled) string for one-time migrations and restores.
3. For a new database, temporarily use the direct Neon string to apply the
   existing schema and canonical data:

   ```powershell
   $env:DATABASE_URL = "<neon-direct-connection-string>"
   npm run migrate --workspace server
   npm run seed --workspace server
   ```

4. To copy the current local database instead, use the direct/unpooled Neon
   connection string for the restore target and run `pg_dump`/`pg_restore`:

   ```powershell
   pg_dump -Fc -d "<local-DATABASE_URL>" -f cardastika.dump
   pg_restore --no-owner --no-privileges -d "<neon-direct-connection-string>" cardastika.dump
   ```

   This preserves the existing tables, `schema_migrations`, seed markers, and
   game data. Do not use a pooled endpoint for `pg_dump`; after the restore,
   `npm run migrate --workspace server` is safe for any future pending
   migrations, and `npm run seed --workspace server` remains idempotent.

## 2. Configure Vercel environment variables

Import the GitHub repository as one Vercel project with the repository root as
the Root Directory. The committed `vercel.json` already sets `npm ci`,
`npm run build`, and `client/dist`.

Add these variables to the Production environment:

```text
DATABASE_URL=<pooled Neon runtime connection string>
TELEGRAM_BOT_TOKEN=<Telegram bot token>
CLIENT_ORIGIN=https://app.cardastika.org
TELEGRAM_BOT_USERNAME=<bot username without @>
GOOGLE_CLIENT_ID=<Google OAuth client ID>
```

`VITE_GOOGLE_CLIENT_ID` is an optional public build-time fallback. Do not add
`VITE_API_URL` for the same-domain deployment, and do not add tunnel variables
to Vercel.

Deploy from the Vercel dashboard or with the Vercel CLI after linking the
project. Migrations and seeds are intentionally manual one-time operations;
they are not run during a serverless request.

## 3. Attach the domain

In Vercel, open **Project Settings -> Domains** and add `app.cardastika.org`.
Apply the DNS record Vercel shows for that hostname. Once DNS has propagated,
remove the Cloudflare Tunnel route for this hostname; the production app no
longer depends on Cloudflare Tunnel or the local PC.

## 4. Telegram and Google settings

Set the Telegram bot menu button Mini App URL to:

```text
https://app.cardastika.org/
```

For Telegram Login Widget, register `app.cardastika.org` with BotFather using
`/setdomain`. Register the same origin in the Google OAuth client’s authorized
JavaScript origins if Google login is enabled.

The local onboarding consumer is started with `npm run dev:bot`. It uses a
long-lived Telegram Bot API polling process and is intentionally not started by
the Vercel serverless function. Before production, run exactly one always-on
bot worker with the production database and Mini App origin, or replace the
polling entry point with an HTTPS webhook endpoint; do not run both consumers
for the same bot token.

## 5. Verify after deployment

Check these URLs:

```text
https://app.cardastika.org/
https://app.cardastika.org/api/health
```

The second URL should return HTTP 200 with `{"ok":true,...}`. Open the first
URL from Telegram and confirm that the authenticated `TopHud` shows the
player name, level, silver, and gold. The existing local commands remain:
`npm run dev:db`, `npm run dev:server`, and `npm run dev`.
