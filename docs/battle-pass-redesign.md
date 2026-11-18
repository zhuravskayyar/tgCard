# «Алмазні нагороди»: redesign plan and sprite prompts

Reference mechanics: [reference-elem-diamond-rewards.md](reference-elem-diamond-rewards.md). Our own parchment style.

## Layout (one phone column, 390–430 px)

1. Heading «Алмазні нагороди» (shared `ScreenHeading`).
2. Lariska line + diamonds + season timer (existing header plate).
3. VIP plate: «VIP на сезон — додаткова колонка нагород» + button «Купити за ⦿1250»
   (one price per season; the server already has it). After purchase: «VIP активний до кінця сезону».
4. «Коло N із 4» and only the **current circle** (finished circles collapse to one line).
5. Track: a vertical spine in the middle, a medallion with the diamond threshold on every stop.
   Left column «Для всіх»: reward icon + amount. Right column «VIP»: item icon + name.
   States: locked (dim), ready (glow + «Забрати»), claimed (tick), VIP without purchase (lock badge).
6. Final stop: ribbon + card reward (normal card → VIP card when VIP is active).
7. «Мої магічні предмети» and «Що може випасти» — a list of every reward and item:
   icon, name, one line of what it does, one grey line of how it is used, «Скоро в грі» for items
   without a game system. Names and descriptions live in server config, not in React.

The painted treasure map (`battle-pass-map/map-v1.webp`, chests) is retired from this screen;
the chests stay for the claim animation.

## Reused art

`trials/medallion-v1.webp` (stop medallions, icon frames), `trials/quest-plate-v1.webp` (rows, VIP plate,
item list rows), `ribbon-title-v3.webp` (final stop), `shop/shop_currency_silver|gold.webp`,
`shop/boosts/boost-banker-1h.png` (currency boost), equipment icons, `DeckCard`, Lariska, `eq-button`.

## New sprites (one file each, transparent PNG, no text)

Shared style block for every prompt:

> Hand-painted fantasy game icon, warm parchment-and-bronze palette, aged brass and dark walnut accents,
> soft painterly shading, crisp silhouette readable at 48 px, centered, single object, transparent
> background, no text, no letters, no frame, no drop shadow, 1024×1024.

| # | File | Prompt (prepend the style block) |
| --- | --- | --- |
| 1 | `bp-track-v1.png` | A vertical strip of an old bronze-studded leather strap with small brass rivets, seamlessly tileable top-to-bottom, 160×1024, straight, centered. |
| 2 | `bp-vip-crest-v1.png` | A small royal crest: a gilded crown over a violet gem, laurel sprigs on both sides. |
| 3 | `item-chest-discount-v1.png` | A bronze-bound treasure chest with a red wax seal stamped with a half-moon, tiny coins spilling. |
| 4 | `item-element-tincture-v1.png` | A small round potion flask with four swirling coloured liquids (red, blue, green, white), cork stopper. |
| 5 | `item-hunting-permit-v1.png` | A rolled parchment scroll tied with a leather cord and a hunting-horn wax seal. |
| 6 | `item-miracle-heal-v1.png` | A glowing green four-leaf clover inside a dewdrop of light. |
| 7 | `item-gold-legacy-v1.png` | An old carved wooden coin box, lid open, ancestral gold coins and a tiny key. |
| 8 | `item-dragon-heart-v1.png` | A glowing ember heart wrapped in dark dragon scales, flames inside. |
| 9 | `item-magic-crystal-v1.png` | A tall violet magic crystal cluster on a small stone base, faint runes glowing. |
| 10 | `item-shuffle-v1.png` | Three fanned playing cards with ornate backs, a small swirl of magic around them. |
| 11 | `item-stone-skin-v1.png` | A round stone shield with cracked granite texture and a bronze rim. |
| 12 | `item-fourth-key-v1.png` | An ornate bronze key with a clover-shaped bow and a small sapphire. |
| 13 | `item-master-charter-v1.png` | An unrolled charter with a golden seal and a quill crossed over it. |
| 14 | `item-magic-shovel-v1.png` | A small enchanted shovel with a carved handle and a glowing blade edge. |

Return the PNGs; Claude trims them, converts to webp under `client/public/assets/ui/battle-pass/`
and wires them in.
