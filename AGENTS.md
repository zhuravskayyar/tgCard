# Cardastika Agent Guide

## Mandatory local-first workflow

This workflow has priority for every project change:

1. Make changes in the local workspace. Start the local database only when database work or relevant tests require it; do not start or open the website or Telegram Mini App for pre-push verification.
2. Make all UI, logic, API, database, and gameplay changes locally first.
3. Before push, inspect the diff and run static checks, builds, and targeted tests proportional to the scope and risk of the change. Website, browser, public API availability, and Telegram Mini App checks happen only after the changes have been pushed.
4. Present the local code changes and verification results for user review; a live website or Mini App preview is not required before push.
5. Never run `git push`, deploy to production, or change the production environment without the user's explicit command.
6. Wait for explicit user confirmation such as `добре`, `пуш`, or `можна в прод` before proceeding.
7. Only after confirmation, perform the final change review, create a commit, push to GitHub, wait for production deployment, and verify the production site, API, Telegram Mini App, and—when relevant—the Telegram bot/webhook.
8. If production differs from localhost, first identify the concrete local-versus-production difference; do not make chaotic additional changes.
9. Code checks and relevant tests must pass before push; live website and Mini App checks follow the authorized push and deployment.
10. Never push unfinished or unverified code.

The required sequence is: `local changes → proportional code checks/tests → user confirmation → commit → push → deployment → website/API → Telegram`.

Do not repeatedly open or check the application or website between edits. Inspecting an external reference requested by the user is allowed before push. This rule does not authorize a push or deployment on its own.

## Project map

- `client/`: React UI and browser entry point.
- `client/src/telegram/`: Telegram Mini App adapters only.
- `server/`: future authoritative Node.js services.
- `game-core/`: future pure game rules and calculations.
- `shared/`: shared TypeScript types and constants.
- `docs/`: detailed architecture, rules, UI, and Telegram guidance.

### Project graph (read first)

- Start every task with `docs/map/index.md` (Obsidian-style map: feature → files → docs).
- Find code with `graphify query "<question>" --budget 800` (also `explain`, `path`, `affected`)
  before broad grep/glob. The graph lives in `graphify-out/` (local, gitignored).
- If `graphify-out/graph.json` is missing, build it without LLM cost:
  `graphify extract . --code-only` then `graphify cluster-only . --no-label`.
- Keep the map current, as part of the same task:
  - after code changes run `graphify update .` (free, AST only; add `--force` after deleting files);
  - when you add a feature, module folder, or doc, add a line to `docs/map/index.md`
    or the matching layer note (`client.md`, `server.md`, `game-core.md`, `shared.md`).

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

## Independent UI review with sub-agents

- For UI work, use sub-agents to independently compare the result with the
  user's idea and the established visual style before handing it off.
- Review whether the screen feels intentional rather than generic or cluttered,
  whether text is readable, and whether spacing, alignment, and hierarchy are
  consistent. Report concrete problems instead of vague approval.
- Check the natural proportions of relevant sprites: no squashed artwork,
  stretched ornaments, accidental cropping, or blurry enlargement. Keep fixed
  artwork proportional; use existing sliced frames for resizable surfaces.
- Fix actionable findings and request a final independent review. State which
  checks were performed in code or on a static mockup and which still need live
  verification. This review does not override the local-first workflow or
  authorize opening the website, pushing, or deploying.

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

- Card art work follows `docs/card-art-workflow.md`: master prompt, acceptance criteria, step-by-step process and current state.
- Before implementing game UI from a visual reference, check that the required
  sprites exist and match it. Generate missing frames, plates, buttons, and
  controls before styling; do not substitute unrelated assets or CSS stand-ins
  for artwork-backed UI.
- If the user requests one asset or one variant, generate and save exactly one
  final file. If preview delivery fails, reuse the existing generation result
  instead of generating a duplicate.

## Required post-task verification

- Only after an explicitly authorized push and deployment, verify that the active
  Telegram Mini App URL serves Cardastika and that its public `/api` path reaches
  the deployed server.
- For source or asset changes that warrant a production build under the
  proportional verification rule, run the production client build before handing
  off the code changes. Defer website and Mini App/API availability checks until after push.
- After push, for changes that can affect authentication, player state, or UI data, open the
  Mini App through Telegram and verify that `TopHud` renders the authenticated
  player's name, level, silver, and gold without a loading or error state.
- Before push, report code verification separately and state that live checks are
  deferred by this rule. After push, do not report live verification as complete
  when the application or authenticated player data is unavailable; fix the issue
  when it is in scope, otherwise state the exact blocker.
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

- Cards may depict humans, humanoids, creatures, spirits, relics, objects, or natural forces.
- Keep entity scale, rarity, and power logically consistent; detailed rules live in `docs/game-rules.md`.
- Complete active decks use 9 cards with a `3/2/2/2` element distribution; inventory is unrestricted.

## Unified battle animation

- Every card battle uses the shared `BattleAttackAnimation` component.
- The player's card flies from its real slot directly onto the opposing card; the opposing card stays in its slot and reacts to the impact.
- Use the same trajectory and timing in duels, arena, campaign, guild raids, and future battle modes. Never add mode-specific flight or flip animations.
- Measure the actual slot positions; do not hardcode flight distances for a screen size.
- Respect reduced-motion preferences and finish the strike before showing the battle result.
- Use the existing button artwork for asset-backed actions; do not replace it with a plain CSS gradient.
