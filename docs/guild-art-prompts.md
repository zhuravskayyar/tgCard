# Гільдія: промпти для графіки

Наявні спрайти, які вже використано і перемальовувати не треба:

- плашка тексту: `ui/game/text-panel-plate-v1.webp`;
- плашка рядка і поля вводу: `ui/trials/quest-plate-v1.webp`;
- бронзове кільце медалі: `ui/trials/medallion-v1.webp`;
- рядок меню, стрічка, заголовок, кнопки: спільні `MenuRow`, `RibbonTitle`, `ScreenHeading`, `ui/theme-book/*`;
- щити гільдії: `guild/guild-shields-simple.png`.

Статус: усі 17 файлів згенеровано й покладено в `client/public/assets/guild/`. Секції 1, 2, 3 і 6 підключені. Секції 4 і 5 чекають на екрани досягнень і рейтингу. Додатково згенеровано 22 призові герби `prize-*-v1.webp` (рендер є, видачі гравцям ще немає) і сорочку `card-back-v1.webp` для закритих карт арени.

## Спільний стиль (додавати до кожного промпта)

Hand-drawn antique book engraving, fine sepia ink cross-hatching on aged warm parchment, bronze and umber tones only, soft worn edges, transparent background, no people, no humanoids, no faces, no hands, no text, no letters, no numbers, no logos, a single object, centered, nothing cropped.

## 1. Медалі режимів (замінюють яскраві `guild-war-art`, `guild-arena-art`, `guild-raid-art`)

Файл: `client/public/assets/guild/medal-<code>-v1.webp`, 512×512. Лежить усередині бронзового кільця, тому без власної рамки.

| code | Промпт |
| --- | --- |
| `war` | `Crossed sword and battle axe over a cracked round shield. <спільний стиль>` |
| `arena` | `Round stone coliseum seen from slightly above, small banners on the wall. <спільний стиль>` |
| `raid` | `Coiled dragon curled around a heap of treasure, wings folded. <спільний стиль>` |

## 2. Значки тем форуму (зараз тимчасово конверт, зірка і замок)

Файл: `client/public/assets/guild/forum-<code>-v1.webp`, 128×128.

| code | Промпт |
| --- | --- |
| `topic` | `Small rolled parchment scroll tied with a cord. <спільний стиль>` |
| `topic-unread` | `Small rolled parchment scroll with a fresh red wax seal. <спільний стиль>` |
| `pinned` | `Small parchment scroll pinned by a bronze nail. <спільний стиль>` |
| `locked` | `Small parchment scroll bound by a chain with a tiny padlock. <спільний стиль>` |

## 3. Розділювач груп рядків

Файл: `client/public/assets/guild/divider-v1.webp`, 1024×64. Промпт: `Long thin horizontal ornamental divider, a slim bronze line with a small leaf knot in the middle, tapering to both ends. <спільний стиль>`

## 4. Досягнення гільдії (екрану ще немає, потрібен разом із серверними даними)

Файл: `client/public/assets/guild/achievement-<code>-v1.webp`, 512×512.

| code | Промпт |
| --- | --- |
| `tab-war` | `Small crossed swords emblem. <спільний стиль>` |
| `tab-arena` | `Small coliseum gate emblem. <спільний стиль>` |
| `tab-raid` | `Small dragon claw emblem. <спільний стиль>` |
| `season-participant` | `Bronze winged medal with a plain round centre. <спільний стиль>` |
| `season-top` | `Silver winged medal with an empty hexagonal centre plate for a number. <спільний стиль>` |

## 5. Найкращі гільдії (рейтинг, екрану трійки ще немає)

Файл: `client/public/assets/guild/podium-<code>-v1.webp`, 512×512. Щит гільдії накладається грою в порожній центр.

| code | Промпт |
| --- | --- |
| `gold` | `Golden laurel wreath with a ribbon below, empty centre, for holding a shield. <спільний стиль>` |
| `silver` | `Silver laurel wreath with a ribbon below, empty centre, for holding a shield. <спільний стиль>` |
| `bronze` | `Bronze laurel wreath with a ribbon below, empty centre, for holding a shield. <спільний стиль>` |

## 6. Створення гільдії

Файл: `client/public/assets/guild/emblem-unknown-v1.webp`, 512×512. Промпт: `Blank engraved heraldic shield with an empty face, for a not yet chosen crest. <спільний стиль>`
