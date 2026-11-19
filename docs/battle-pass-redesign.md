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

## Track background (requested 2026-11-19)

The old treasure map was cropped at the sides and too busy under the captions. One replacement file:
`bp-track-bg-v1.png`, 1024×2800 (portrait, about 1:2.7, the height of one circle on a 430px phone).

> Hand-painted fantasy treasure-map background for a mobile card game, warm parchment-and-sepia palette
> (cream #ecdcb8 paper, soft ochre, faded olive and slate-blue accents), gentle painterly ink-and-wash style,
> top-down view, portrait 1024×2800, no text, no letters, no UI, no characters, no frame, no torn border.
> A straight sandy road runs exactly down the vertical centre (about 12% of the width) from top to bottom.
> Both sides of the road stay calm and light for readable dark text: soft meadows, faint low hills, a few
> sparse pale trees and small rocks only at the far outer edges; no dark forests, rivers or ruins next to the road.
> The bottom fifth opens into a small sunlit clearing with a low carved stone pedestal at the centre, faint
> golden glow around it. The top has a thin band of soft clouds. All four edges fade smoothly into plain
> parchment of the same cream colour, so the image blends into the page without visible borders.

Integrated 2026-11-19 as `bp-track-bg-v1.webp` (731×2000): `center bottom 38px / 100% auto` on `.reward-track::before`,
replacing `battle-pass-map/map-v1.webp`; the strap lies on the road, the final card on the pedestal.
