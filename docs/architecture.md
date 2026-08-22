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

## Shop transaction boundary

`GET /api/shop/cards` returns the safe server-owned Cards catalog together with
the authenticated player's current pity meters and affordability.
`POST /api/shop/cards/purchase` accepts only `{ "offerId": string }`.

The purchase transaction locks the player and normalized
`player_shop_chances` rows, resolves rarity through the fixed-point pity policy,
selects an exactly matching shop-eligible canonical card, deducts the canonical
price, persists pity and ownership, invokes the shared automatic deck service,
and commits all results together.

Offer prices and increments live in server configuration. Player chances live
in PostgreSQL per player, offer, and target rarity. The client receives only
current percentages and safe purchase results, never RNG state or database
details.
