# Campaign 1

Campaign 1 is a server-authoritative path of 6 sequential stages with exactly 6
quests each. The 36 quest definitions and Ukrainian copy live in
`server/src/campaign/campaignConfig.ts`. Quests inside the active stage can be
completed in any order; the next stage opens only after all six rewards are
claimed. The final boss is a separate battle and unlocks only after 36 claims.

## Quest state and progress

Every quest moves through `locked → active → completed → claimed`.
`completed` means the server condition is satisfied; rewards are granted only by
the authenticated claim route. Claim locks campaign progress and the player row
in one transaction, applies fixed XP/silver, records `claimed_at`, and is
idempotent on retry. Campaign XP can trigger the existing account-level Gold
reward, but Campaign never grants Gold directly.

Progress is derived from persisted server events and current authoritative
state. Deck/card/collection opens are recorded after a successful owned-resource
response. Shop purchase, discovery, absorption, level-up and Duel events are
recorded inside their owning transaction. Current-card-level, collection ratio,
owned-element and weak-card thresholds are queried from inventory state. No
client counter is accepted.

Routes:

- `GET /api/player/campaign`
- `GET /api/player/campaign/stages/:stageId`
- `POST /api/player/campaign/quests/:questId/claim`
- `POST /api/player/campaign/boss/start`
- `GET /api/player/campaign/boss/active`
- `GET /api/player/campaign/boss/:battleId`
- `POST /api/player/campaign/boss/:battleId/action`

## Варт and dialogue data

Варт is the non-playable stone raven spirit and is never a card. Dialogues are
configuration records with trigger, NPC, emotion, paragraphs, art key and an
optional navigation target. The client uses one reusable dialogue view and falls
back to the Campaign glyph when an emotion sprite asset is absent. Supported art
keys cover neutral, serious, happy, proud, warning, surprised, angry, sad,
mysterious and battle.

## Referral, friendship and boost

Each player receives a stable, public, non-secret referral code. A Telegram
`start_param` of `ref_<code>` is trusted only after the whole `initData` payload
passes Telegram signature and age validation. Acceptance rejects self-referral,
requires two real player rows, and is unique by invited player. It atomically
creates one canonical symmetric friend pair and one inviter `account_x2` boost.

The boost runs on server time from acceptance through exactly 24 hours. For Duel
and Campaign battle earnings the order is base reward, collection reward
modifier, account ×2, final rounding. It never changes fixed quest rewards,
Gold, Shop state, rarity odds, card power, HP or damage. `VITE_TELEGRAM_BOT_USERNAME`
enables the client to form the shareable `https://t.me/<bot>?startapp=ref_<code>`
link without exposing the bot token or raw `initData`.

## Secret Мантикора battle

The boss is a server-owned `campaign_boss` Duel snapshot built from nine existing
collection card codes with a valid 3/2/2/2 element mix. It is persisted in the
existing `duels` table and resolved by the same `resolveDuelExchange` core,
cyclic pools, HP, element matrix, counterattack, mutual-KO and version checks.

Player-facing start/resume state contains three `{ hidden: true, slotIndex }`
placeholders. It does not contain the boss active/reserve cards, card names, art,
elements, levels, powers, rarities or pair multipliers. An action accepts only
`slotIndex` and `expectedVersion`; its completed exchange reveals the actual used
boss card in the persistent Duel battle log, while the replacement slot is
redacted again.

The first victory transaction grants base 600 XP and 1000 silver through battle
modifiers/boost, creates one standard Lv15 Rare Мантикора instance, records
discovery and collection completion, recalculates the automatic deck, and marks
Campaign 1 complete. The campaign-state guard and locked Duel row prevent reward
duplication on reload or retry.
