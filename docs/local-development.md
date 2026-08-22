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
