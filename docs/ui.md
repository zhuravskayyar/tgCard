# UI Direction

The client is mobile-first and should be designed primarily for viewports around
360–430 px wide. It must remain usable in an ordinary desktop browser for local
development.

Keep screens in `client/src/screens`, reusable visual pieces in `components`, and
screen-independent React behavior in `hooks`. Prefer existing components and
small CSS modules or focused styles over premature design systems.

The current client is only an architecture status screen. Navigation, cards,
deck UI, battles, shop, animations, and final visual design are out of scope.

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
