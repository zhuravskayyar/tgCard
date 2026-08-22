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
