# Бестіарій: промпти для графіки

Наявні спрайти, які вже використано і перемальовувати не треба:

- сторінка книги: `ui/bestiary/page-v1.webp`, вирізано з `ui/home/menu-background-book-clean-v3.webp`;
- плашка заголовка і вкладки: наявні `ScreenHeading` і `collection-filter`;
- стрічка назви: `ui/ribbon-title-v3.webp`;
- медальйон емблеми: `ui/game/nav-medallion-v1.webp`;
- рамка гравюри: `ui/home/hud-avatar-frame-v2.webp`;
- рамка неотриманої карти: `ui/equipment/slot-v1.webp`.

Похідні заглушки, які можна замінити кращими: `ui/bestiary/seal-gold-v1.webp`, `bookmark-v1.webp`.
## Спільний стиль (додавати до кожного промпта)

Hand-drawn antique book engraving, fine sepia ink cross-hatching on aged warm parchment, bronze and umber tones only, soft worn edges, no people, no humanoids, no faces, no text, no letters, no numbers, no logos, a single object, centered, nothing cropped.

## 1. Гравюри місцевостей (15 штук)

Файл: `client/public/assets/ui/bestiary/engravings/<code>.webp`, формат 4:3, 800×600. Заливка на всю площу, без рамки: рамка накладається в грі. Гравюру підхоплено автоматично, щойно файл з'явиться.

Промпт: `Wide landscape engraving plate, 4:3, filling the whole image edge to edge, no frame: <сцена>. <спільний стиль>`

| code | Назва | Сцена |
| --- | --- | --- |
| `borderlands` | Прикордоння | a lonely watchtower and a palisade on grassy hills, a dirt road fading into distant forest |
| `black_forest` | Чорний ліс | dense ancient black pines with twisted roots, thin mist between the trunks |
| `marsh` | Трясовина | a stagnant bog with reeds, dead trees and rotting wooden walkways |
| `ash` | Попіл | a scorched plain of charred stumps under a smoking volcano, drifting ash |
| `abyss` | Безодня | a vast undersea trench with kelp and jagged rock, faint light from above |
| `storm` | Шторм | a jagged sea cliff beneath towering storm clouds and forked lightning |
| `ice` | Крига | a frozen fjord with glaciers and ice spires under a pale sky |
| `stone_halls` | Кам'яні зали | a colossal underground hall of carved stone columns fading into the dark |
| `night` | Ніч | a moonlit valley with a sky full of stars and silent bare trees |
| `ruins` | Руїни | collapsed temple columns overgrown with vines and moss |
| `dragons` | Дракони | a high mountain peak with an empty dragon nest of bones and hoarded treasure |
| `three_realms` | Три царства | three floating islands of earth, sea and sky linked by a giant tree's roots |
| `alchemy` | Алхімія | an abandoned alchemist's workshop with retorts, flasks and an open furnace, no figures |
| `lost_world` | Загублений світ | a hidden jungle plateau with giant ferns and waterfalls behind high cliffs |
| `wastes` | Пустка | an endless cracked desert with bleached bones and lone wind-carved rocks |

## 2. Емблеми колекцій (15 штук, необов'язково)

Зараз використано наявні іконки `game-icons`. Файл: `ui/bestiary/emblems/<code>.webp`, прозорий PNG, 256×256.

Промпт: `Small heraldic emblem, one dark sepia ink symbol on a fully transparent background, no circle, no plate: <символ>. <спільний стиль>`

Символи за порядком таблиці вище: watchtower; pine tree; reed and bog bubble; flame over ash; deep wave; lightning bolt; ice crystal; stone arch; crescent moon and star; broken column; dragon wing; three-pointed crown; alchemical flask; fern leaf; bleached skull of a beast.

## 3. Золота печатка

Файл: `ui/bestiary/seal-gold-v2.webp`, прозорий PNG, 256×256.

`Round gold wax seal with uneven melted edges, embossed World Tree silhouette in the middle, warm antique gold with a soft shine, fully transparent background. <спільний стиль>`

## 4. Бічна шкіряна закладка

Файл: `ui/bestiary/bookmark-v2.webp`, прозорий PNG, 96×360.

`Vertical narrow dark oxblood leather bookmark strip with stitched edges, a small bronze rivet at the top, a swallowtail cut at the bottom, fully transparent background. <спільний стиль>`