# Cardastika Agent Guide

## Mandatory local-first workflow

This workflow has priority for every project change:

1. Start the project locally on `localhost` with a real local database connected.
2. Make all UI, logic, API, database, and gameplay changes locally first.
3. After changes, start the local frontend and backend/API as needed, verify the PostgreSQL connection when relevant, check console and server logs for errors, and run verification proportional to the scope and risk of the change.
4. Show the local result for user review.
5. Never run `git push`, deploy to production, or change the production environment without the user's explicit command.
6. Wait for explicit user confirmation such as `добре`, `пуш`, or `можна в прод` before proceeding.
7. Only after confirmation, perform the final change review, create a commit, push to GitHub, wait for production deployment, and verify the production site, API, Telegram Mini App, and—when relevant—the Telegram bot/webhook.
8. If production differs from localhost, first identify the concrete local-versus-production difference; do not make chaotic additional changes.
9. Production must never be used for initial testing.
10. Never push unfinished or unverified code.

The required sequence is: `LOCALHOST + LOCAL DB → changes → local verification → user confirmation → commit → push → production site → Telegram`.

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

## Rule for running tests after changes

Verification must be proportional to the change. Do not run the full test suite,
full build, or other expensive checks automatically after every small change.
Start with the fastest sufficient verification and expand it only when the
initial check finds a problem or the change has wider impact.

### Small UI or content changes

Examples include replacing an image or other asset, changing text, a small
layout adjustment, margin/padding/gap changes, size/color/font changes, a small
CSS fix, icon or decorative-element replacement, and coordinate or alignment
changes that do not affect program logic.

For these changes:

- Do not run the entire test suite.
- Inspect the changed file and check for obvious syntax or asset-reference errors.
- Run a local or targeted component check only when it is useful.
- Do not run all unit, integration, backend, regression, or full-package build
  checks without a concrete reason.

### Local functional changes

When changing a specific function, component, API, or gameplay mechanic, run
only the tests and checks directly related to that area. For example, deck
logic changes do not require automatically testing the shop, profile, guild,
or unrelated project areas.

### Full verification

Run the full test suite and build when the change affects shared or core logic,
database schema or migrations, API contracts, authentication, global gameplay
logic, a large refactor, multiple modules, or has a meaningful regression risk.
Also run full verification when the user explicitly requests it or when the
work is being prepared as a final large commit or release and the broader check
is justified.

If the full test suite was not run for an isolated, low-risk change, report:

`Full test suite not run — change is isolated and low-risk; targeted verification was sufficient.`

## Asset generation

- If the user requests one asset or one variant, generate and save exactly one
  final file. If preview delivery fails, reuse the existing generation result
  instead of generating a duplicate.

## Required post-task verification

- Before completing every task, verify that the active Telegram Mini App URL
  serves Cardastika and that its public `/api` path reaches the local server.
- For source or asset changes that warrant a production build under the
  proportional verification rule, run the production client build and repeat
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
