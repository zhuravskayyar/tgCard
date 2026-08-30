# UI Direction

The client is mobile-first and should be designed primarily for viewports around
360–430 px wide. It must remain usable in an ordinary desktop browser for local
development.

Keep screens in `client/src/screens`, reusable visual pieces in `components`, and
screen-independent React behavior in `hooks`. Prefer existing components and
small CSS modules or focused styles over premature design systems.

The current client includes the persistent shell, automatic deck and card-detail
views, the base card shop, and the authenticated in-game mail screen. Battles,
elaborate reward animations, and final visual polish remain out of scope.

The Shop navigation is prepared for `Карти`, `Підсилення`, and `Готові набори`.
Only `Карти` is active. Its offer panels show the guaranteed rarity, real
per-player accumulated upgrade chances, miss increments, and authoritative
affordability; the other sections contain no gameplay logic yet.

## Profile and mail

The Profile screen follows the reference structure: player identity, empty
equipment layout, deck power, mail/deck/equipment/records rows, distinctions,
ratings, bonuses, activity, and gifts. It uses the authenticated player summary
and active automatic deck where real data exists. Completed collection bonuses
come from the authoritative player summary and remain visible as permanently
active effects. Equipment, records, combat ratings, experience, and gifts are
not yet authoritative, so they render disabled controls, dashes, or explicit
empty states instead of invented values. Authenticated mail is available from Home and Profile; unread mail
marks the envelope with an attention animation. Promotional blocks are not
included.

## Interactive first-session tutorial and campaign route

The reference source of truth for this onboarding is
[`https://elem.mobi/`](https://elem.mobi/), specifically its tutorial flow.
Cardastika keeps the same gameplay order and instructional intent while using
its own persistent `TopHud` and `BottomNav` shell and Ukrainian copy.

Only a server-marked new account receives the versioned, client-persisted
interactive introduction; existing accounts never get it automatically. Лариска
opens the actual training Duel immediately. It follows the reference sequence:
the first card is enabled, then the second card after the first exchange, then
all cards after the second exchange. The server fixes the tutorial exchange to
`35 → 23 → 5 → 0` enemy HP and `180 → 168 → 162` player HP, so the explanation
and visual state cannot drift between accounts.

The dialogue uses a dark navy panel, readable yellow copy, the NPC portrait,
one current target, and no numbered progress counter. The three mandatory
messages are: `Твої карти внизу. Карти суперника — вгорі. Атакуй своєю
картою!`, `Критичні удари в 1,5 раза сильніші! Атакуй!`, and `Добий ворога
будь-якою картою!`. The victory screen keeps the reference order: rewards,
duel-win text, a short Лариска message, and `За нагородою`.

The introduction then hands the player to the Campaign. Pressing `За нагородою`
finishes the tutorial on the server and releases the normal application
navigation; Campaign remains the next recommended route, while its quests can
open the relevant deck, Duel, shop, weak cards, and collection screens and
return to the current campaign stage. A legacy client state of `campaign` is
migrated to `complete` so an interrupted onboarding cannot trap the player in
the campaign gate.

Tutorial parity is an acceptance rule: a fresh or replayed tutorial must start
in Duel, allow exactly one first-card action, then exactly one advantage-card
action, then allow any remaining card; it must end on the victory screen with
`За нагородою`. That action must persist completion before releasing navigation,
and the tutorial Duel must remain authoritative server/API state rather than
mock client data.

The tutorial uses `data-tutorial-target` markers on existing UI controls and
renders through the persistent `AppShell`. It never inserts mock cards, player
data, currency, or deck state; all displayed game values come from the
authoritative tutorial Duel/API state. A migration preserves players who had
already reached Campaign before the reference-aligned flow was deployed.

Home must make unavailable content explicit. Modes and sections without a
working route render disabled with a `Скоро` state instead of behaving like
active navigation targets.

## Global UI rule: persistent application shell

`TopHud` and `BottomNav` are persistent application shell elements. They must
always remain visible on every normal game screen and sub-screen, including
Home, Deck, Card Detail, Collection, Inventory, Shop, Profile, Guild, Campaign,
Arena, Dungeon, and Tournament.

Individual screens must not hide, replace, duplicate, or recreate these shell
elements. Screens render only inside the scrollable content area between
`TopHud` and `BottomNav`.

`BottomNav` always contains exactly:

- `Головна`
- `Профіль`
- `Гільдія`

`TopHud` always contains the current authenticated player's real data. Back
navigation for a sub-screen belongs inside the content area below `TopHud` and
must not replace either persistent shell element.

Only a future explicitly documented fullscreen gameplay mode may override this
rule. Never introduce such an exception without explicit instruction.

## Daily login reward modal

`Нагорода за вхід` is a separate AppShell-level modal, visually based on the
provided Cardastika reference: a dark fantasy panel, gold title bar, reward
tiles in the center, Лариска on the right, and a large green `Забрати` button.
It opens automatically after the authenticated profile has loaded when the
server marks the current UTC date as claimable. Opening or closing the modal
does not grant anything; only the button performs the server claim. After a
successful claim the reward is highlighted, the updated player balance is
reflected in `TopHud`, and the player can close the modal.

The modal consumes the server-provided reward summary and the 7-day calendar.
The `Завдання` screen contains only task progress and rewards for completing
those tasks; it has no daily-login calendar or claim action. The backend remains
the authority for the once-per-day check and atomic grant.

## Global UI rule: Card Detail actions

Every Card Detail screen contains these three persistent action rows in this
exact order:

- `Колода`
- `Слабкі карти`
- `Магазин`

They appear below the card information and deck-state section and above the
persistent `BottomNav`. Always use the shared `MenuRow` component and its
compact variant; do not duplicate its visual styles locally. `TopHud` and
`BottomNav` remain visible while Card Detail is open.
