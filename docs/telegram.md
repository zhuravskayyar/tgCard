# Telegram Integration

Telegram remains a host integration. The client reads the raw
`Telegram.WebApp.initData` string through `client/src/telegram` when running as
a Mini App. An ordinary browser renders Telegram Login Widget and Google
Identity Services buttons. After a provider check succeeds, the client stores
only a Cardastika session token and uses it for game API requests.

## One player, multiple identities

Migration `023_unified_player_auth.sql` adds `auth_identities` for verified
Telegram and Google IDs, `player_sessions` for hashed expiring Cardastika
tokens, and provider-independent `players.rating`. It backfills each existing
`players.telegram_user_id` into an identity without changing cards, decks,
currency, level, rating, or progress. Linking requires an authenticated
Cardastika session and never merges two existing players.

## Player bootstrap

1. The client sends `{ "initData": "..." }` to `POST /api/auth/telegram`.
2. The server validates the Telegram HMAC-SHA-256 signature with
   `TELEGRAM_BOT_TOKEN` and rejects expired `auth_date` values.
3. Only after validation, the server extracts the Telegram user and atomically
   creates or loads the PostgreSQL player by unique 64-bit Telegram user ID.
4. A new player receives the server-owned defaults: level `1`, silver `1500`,
   and gold `0`.

The response is a session envelope containing a compact shared player summary,
the session token, and linked identities. The auth endpoints are:

- `POST /api/auth/telegram` for signed Mini App `initData`;
- `POST /api/auth/telegram/web` for verified Telegram Login Widget data;
- `POST /api/auth/google` for a Google Identity Services ID token;
- `GET /api/auth/config` for public Telegram bot and Google client configuration;
- `GET /api/auth/me` for the current Cardastika session;
- `POST /api/player/tutorial/complete` to finalize the introductory tutorial;
- `POST /api/auth/link` for explicit account linking;
- `POST /api/auth/logout` for web-session revocation.

```ts
{
  player: {
    id: string
    username: string | null
    firstName: string
    photoUrl: string | null
    level: number
    silver: number
    gold: number
  }
  sessionToken: string
  identities: Array<{ provider: "telegram" | "google"; email: string | null }>
}
```

## Environment and migrations

Set `DATABASE_URL` and `TELEGRAM_BOT_TOKEN` in the server environment.
`GOOGLE_CLIENT_ID` enables the backend Google audience check and
`VITE_GOOGLE_CLIENT_ID` is an optional build-time fallback; the browser now
loads public provider configuration from `/api/auth/config`. Set
`TELEGRAM_BOT_USERNAME` when possible (the server can also resolve it from the
configured bot token). Never expose the bot token to client code.
Apply versioned migrations explicitly with `npm run migrate --workspace server`;
they are not run during server startup.

For a public development Mini App, set `CLIENT_ORIGIN` on the server to the exact
HTTPS client origin and build or start the client with `VITE_API_URL` set to the
public HTTPS API origin. Local development keeps using the Vite `/api` proxy when
`VITE_API_URL` is empty. Temporary tunnel URLs belong only in environment state,
never in React components or committed configuration.

For Campaign referral links, the client needs the public bot username in
`VITE_TELEGRAM_BOT_USERNAME`. The Telegram development launchers populate it
from `getMe` before starting Vite; set it manually for other deployments. The
client then opens Telegram's `share/url` chooser with a public
`https://t.me/<bot>?startapp=ref_<code>` link. Telegram does not expose the
selected recipient back to a Mini App, so the server records the inviter and
recipient when the recipient first opens the Mini App. That signed first start
is the acceptance point and the one-time bonus is granted transactionally.
`TELEGRAM_BOT_TOKEN` and raw `initData` remain server-only/authentication-only
respectively. The server reads `start_param` only from the already
signature-validated Telegram payload. The referral parser normalizes
case/whitespace and accepts copied `startapp`/`start_param` wrappers without
trusting an unsigned URL.

Telegram Login Widget also requires the exact public web origin to be
registered for the bot in BotFather (`/setdomain`). Without that provider-side
setting Telegram displays `Bot domain invalid` even though Cardastika's
backend and widget configuration are healthy.

## Telegram bot onboarding

The bot runtime lives in `server/src/bot` and uses the Telegram Bot API's long
polling mode. It keeps the bot intentionally small: `/start` is the entry point,
the game itself opens as a Mini App, and the Mini App keeps the fixed
`Головна / Профіль / Гільдія` navigation.

Run it locally after PostgreSQL is available:

```powershell
npm run dev:bot
```

New Telegram users receive a short Cardastika introduction. Existing players
receive the launch button immediately, with `Про гру` available to replay the
introduction. The bot checks the existing Telegram identity in PostgreSQL and
does not create a player during `/start`; player creation remains owned by the
signed Mini App authentication flow.

Real onboarding screenshots belong in `bot/assets/onboarding/` with the names
listed in that folder's README. Missing files are skipped and never replaced by
generated images. Set `CARDASTIKA_MINI_APP_URL` only when the bot must use a
different HTTPS Mini App origin than `CLIENT_ORIGIN`.
