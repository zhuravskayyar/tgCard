# Architecture

Cardastika is split by responsibility so that game rules remain reusable and the
Telegram host stays an optional integration rather than an application boundary.

## Modules

- `client` renders the interface. It may call server APIs and `game-core` helpers
  intended for presentation, but it must not decide authoritative outcomes.
- `game-core` will contain deterministic, side-effect-free rules and calculations.
  It must not depend on React, Telegram, databases, or Node.js services.
- `server` will own battle state, inventory, currencies, persistence, and trusted
  validation. Server-side Telegram verification belongs in `server/src/auth`.
- `shared` will contain small TypeScript contracts and constants used across
  boundaries. It must not become a home for business logic.

## Dependency direction

The client and server may depend on `shared` and `game-core`. `game-core` may
depend on `shared`. Neither `shared` nor `game-core` may depend on the client or
server. Telegram APIs are accessed through the adapter in `client/src/telegram`.

Keep public contracts explicit, modules focused, and dependencies minimal. Add
workspace packages only when those modules contain real code that needs building.

## Player persistence

The server uses PostgreSQL through `DATABASE_URL`. Schema changes are explicit,
versioned SQL migrations under `server/migrations`; application startup never
applies destructive or automatic schema changes. The first persistence boundary
contains only Telegram-authenticated player accounts.
