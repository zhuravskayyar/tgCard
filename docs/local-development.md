# Local database

PostgreSQL 16 runs inside the `Ubuntu` WSL distro. After a WSL or Windows
restart, run `npm run dev:db`. The command starts PostgreSQL and verifies
Windows Node connectivity through WSL's built-in localhost forwarding at
`127.0.0.1:5432`. A dedicated idle keepalive process keeps the distro and its
localhost relay active; no changing WSL IP, custom TCP bridge, or Windows
`portproxy` is required.

Then start the server with `npm run dev:server` and the client with `npm run dev`.
PostgreSQL remains bound to WSL loopback and is never exposed on `0.0.0.0` or a
public interface.

## One-click Telegram development

The normal launcher is now the fast, stable path:

```powershell
npm run dev:telegram
```

It expects a permanent Cloudflare Tunnel hostname and token in the ignored
`.env` file:

```dotenv
CLIENT_ORIGIN=https://app.example.com
CLOUDFLARE_TUNNEL_TOKEN=your-named-tunnel-token
# Or, for a locally-managed tunnel created with `cloudflared tunnel create`:
CLOUDFLARE_TUNNEL_ID=your-tunnel-id
CLOUDFLARE_TUNNEL_NAME=cardastika-dev
```

Create the Cloudflare Tunnel once, configure its public hostname to proxy to
`http://127.0.0.1:5173`, and put the resulting token and hostname in `.env`.
For locally-managed tunnels, the launcher can use the credential JSON created
under `%USERPROFILE%\.cloudflared` from the tunnel ID and name instead of a
token.
The fast launcher builds the client and serves the production bundle through
Vite preview, so the public Mini App has no HMR WebSocket that can disconnect
while a game is in progress. It keeps the client, server, and named tunnel
alive, reuses them on later runs, changes the Telegram menu only when the URL
is wrong, and never runs migrations or seeds. Run it again after client changes
to rebuild the bundle.

For first-time setup or after changing database schema/content, use the slower
bootstrap launcher explicitly:

```powershell
npm run dev:telegram:setup
```

The setup launcher loads the ignored local environment files, applies pending
database migrations and idempotent canonical content seeds, starts any missing
database/server/client process, and can create a temporary quick tunnel when
no permanent tunnel is configured. Temporary quick-tunnel URLs are not stable
and must not be used as the long-term Telegram Mini App URL.

If the local database credentials are not configured after a restart, the
launcher asks for `DATABASE_URL` once with hidden input and stores it in the
current Windows user's environment. It does not print the value.

The launcher restarts only a Cardastika server process when its configured CORS
origin does not match the active Telegram tunnel. For live local browser work,
use `npm run dev`; the Telegram launcher intentionally serves a stable
production preview instead of watch mode.
