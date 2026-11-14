# Скрині й Лавка скринь: що намалювати і промпти

Стан на 2026-11-13. Механіка лавки — `docs/chest-shop.md`, вигляд наш.

## Навіщо

Зараз скрині відкриваються підміною двох різних малюнків на 240 px (`ui/battle-pass-map/chest-ready-v1.webp`,
`chest-open-v1.webp`), тому картинка «стрибає». Нова анімація: **одна й та сама скриня в трьох станах** на
однаковому полотні — закрита → прочинена (зі щілини б'є світло) → відкрита. Між кадрами працюють тряска,
спалах і виліт призу, анімація йде на 30+ FPS (CSS-анімації, ~1,1 с).

## Файли

| № | Файл | Стан |
|---|---|---|
| 1 | `ui/chest/chest-closed.webp` | Закрита — еталон |
| 2 | `ui/chest/chest-ajar.webp` | Кришка піднята на ~30°, зі щілини б'є тепле світло |
| 3 | `ui/chest/chest-open.webp` | Кришка відкинута назад, всередині сяє золото |
| 4 | `ui/home/sprites/row-chest-shop.webp` | Ілюстрація рядка «Лавка скринь» на головній, як у `row-shop.webp` |

Вимоги: квадрат 1:1, прозорий фон, PNG з альфою; без тексту, цифр, рамок і водяних знаків. Кадри 2 і 3 —
**редагування** кадру 1 у тому самому чаті, щоб скриня, розмір і положення збігалися.

## Промпти

### 1. Закрита скриня (еталон)

> A closed medieval treasure chest with a rounded barrel lid, lid fully shut, front brass latch closed.
> Rich hand-painted fantasy game item: warm dark oak planks with visible grain, heavy aged brass corner
> guards, brass bands with round rivets, one large brass latch plate on the front. Three-quarter front
> view from slightly above, soft warm light from the upper left, crisp clean silhouette. Single isolated
> object, centred, about 62% of the canvas width, sitting low with generous empty space above it for an
> opened lid, nothing touches the edges. Fully transparent background, PNG with alpha. No glow, no coins,
> no background, no shadow plate, no text, no letters, no numbers, no logo, no watermark. Square 1:1.

### 2. Прочинена (редагування №1)

> Edit this exact image. Keep the chest body identical: same chest, same size, same position on the canvas,
> same lighting. Only the lid changes: it is lifted about 30 degrees on its rear hinges, the latch is open,
> and a bright warm golden light pours out of the gap between the lid and the box, with a few gold sparks.
> Fully transparent background, PNG with alpha. No text, no watermark. Square 1:1.

### 3. Відкрита (редагування №1)

> Edit this exact image. Keep the chest body identical: same chest, same size, same position on the canvas,
> same lighting. The lid is now fully open, swung back about 110 degrees on its rear hinges so its inner
> side is visible. Inside, the chest glows with warm golden light rising upward, a soft heap of gold coins
> and a few sparks. Fully transparent background, PNG with alpha. No text, no watermark. Square 1:1.

### 4. Рядок «Лавка скринь» на головній

Додай до промпту `row-shop.webp` як зразок стилю.

> A small medieval merchant's corner full of treasure chests: three or four closed wooden chests of
> different sizes stacked on and beside a low wooden counter, one chest slightly open with a hint of coins
> inside, a hanging lantern and a cloth awning above. Same style as the attached image: sepia ink engraving
> with fine hatching, warm parchment and brown tones only, hand-drawn storybook illustration. Horizontal
> scene about 2:1, isolated with soft hand-drawn edges, fully transparent background, PNG with alpha.
> No text, no letters, no numbers, no sign writing, no logo, no watermark.
