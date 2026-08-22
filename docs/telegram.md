# Telegram Integration

Telegram remains a host integration. The client reads only the raw
`Telegram.WebApp.initData` string through `client/src/telegram`; in an ordinary
browser it renders the neutral unavailable state and never creates a fake player.

## Player bootstrap

1. The client sends `{ "initData": "..." }` to `POST /api/auth/telegram`.
2. The server validates the Telegram HMAC-SHA-256 signature with
   `TELEGRAM_BOT_TOKEN` and rejects expired `auth_date` values.
3. Only after validation, the server extracts the Telegram user and atomically
   creates or loads the PostgreSQL player by unique 64-bit Telegram user ID.
4. A new player receives the server-owned defaults: level `1`, silver `1500`,
   and gold `0`.

The response is a compact shared player summary:

```ts
{
  id: string
  username: string | null
  firstName: string
  photoUrl: string | null
  level: number
  silver: number
  gold: number
}
```

## Environment and migrations

Set `DATABASE_URL` and `TELEGRAM_BOT_TOKEN` in the server environment. `PORT` is
optional and defaults to `3000`. Never expose the bot token to client code.
Apply versioned migrations explicitly with `npm run migrate --workspace server`;
they are not run during server startup.

For a public development Mini App, set `CLIENT_ORIGIN` on the server to the exact
HTTPS client origin and build or start the client with `VITE_API_URL` set to the
public HTTPS API origin. Local development keeps using the Vite `/api` proxy when
`VITE_API_URL` is empty. Temporary tunnel URLs belong only in environment state,
never in React components or committed configuration.
