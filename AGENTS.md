# Cardastika Agent Guide

## Project map

- `client/`: React UI and browser entry point.
- `client/src/telegram/`: Telegram Mini App adapters only.
- `server/`: future authoritative Node.js services.
- `game-core/`: future pure game rules and calculations.
- `shared/`: shared TypeScript types and constants.
- `docs/`: detailed architecture, rules, UI, and Telegram guidance.

## Working rules

- Read only files relevant to the current task.
- Do not scan the whole repository unless the task requires it.
- Do not inspect card artwork or other assets unless explicitly requested.
- Do not modify unrelated files or perform broad refactors.
- Reuse shared UI components before creating new styles or variants.
- Never hardcode mock player, economy, inventory, progression, battle, or card
  data in UI components.
- UI consumes typed application or domain state.
- When real data is unavailable, render loading, empty, or error states.
- Game defaults belong in server, game-core, or configuration, not React UI.
- Keep modules small, focused, and dependency-light.
- Keep UI in `client`; never put game calculations in React components.
- Keep Telegram-specific client code in `client/src/telegram` and server-side
  Telegram verification in `server/src/auth`.
- Treat the server as authoritative for battles, inventory, and currencies.
- Put reusable pure rules in `game-core` and shared contracts in `shared`.
- Run only checks and tests relevant to the files changed.
- Put detailed rules and design decisions in `/docs`, not this file.

## Asset generation

- If the user requests one asset or one variant, generate and save exactly one
  final file. If preview delivery fails, reuse the existing generation result
  instead of generating a duplicate.

## Required post-task verification

- Before completing every task, verify that the active Telegram Mini App URL
  serves Cardastika and that its public `/api` path reaches the local server.
- After every source or asset change, run the production client build and repeat
  the Mini App/API availability check before handing off the task.
- For changes that can affect authentication, player state, or UI data, open the
  Mini App through Telegram and verify that `TopHud` renders the authenticated
  player's name, level, silver, and gold without a loading or error state.
- Do not report a task as complete when either the application or authenticated
  player data is unavailable; fix the issue when it is in scope, otherwise state
  the exact blocker.
- If Telegram shows `Помилка даних`, verify Telegram init-data authentication
  against the running server, restart the server from the same bot-token source
  used by the Mini App, and confirm that `TopHud` shows the authenticated
  player's name, level, silver, and gold.

## Persistent application shell

- `TopHud` and `BottomNav` are persistent on every normal screen and sub-screen.
- Screens render only in the scrollable content area between those shell elements.
- Never hide, replace, duplicate, or recreate either shell element inside a screen.
- `BottomNav` always contains exactly `Головна`, `Профіль`, and `Гільдія`.
- `TopHud` always shows the authenticated player's real data.
- Sub-screen Back controls belong inside content below `TopHud`.
- Only an explicitly documented future fullscreen gameplay mode may override this.

## Card detail

- Every Card Detail shows `Колода`, `Слабкі карти`, and `Магазин` action rows.
- Place them below card information/state and above the persistent `BottomNav`.
- Always reuse the shared `MenuRow`; never duplicate its styles in the screen.

## Card content

- Cards may depict non-humanoid creatures, spirits, relics, objects, or natural forces.
- Never invent humans, humanoids, anthropomorphic animals, human faces, clothing, or roles for card subjects.
- Keep entity scale, rarity, and power logically consistent; detailed rules live in `docs/game-rules.md`.
- Complete active decks use 9 cards with a `3/2/2/2` element distribution; inventory is unrestricted.
