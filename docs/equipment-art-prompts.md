# Спорядження: що намалювати і повні промпти

Стан на 2026-11-09. Механіка взята з довідника elem.mobi (`docs/equipment-manual.md`), вигляд — наш: готична таро-ксилографія, чорна туш і кремова заливка на пергаменті.

## Нова схема: 9 предметів + 6 фонів = 15 файлів

Замість 16 речей «під кожну стихію» малюємо **одну річ на тип**. Стихію накладає шейдер: він перефарбовує кремову заливку в колір стихії, а чорна туш лишається. Рідкість показує **окремий намальований фон** під предметом.

| № | Файл | Що це | Назва в грі |
|---|---|---|---|
| 1 | `items-v3/head.webp` | Каптур | Каптур |
| 2 | `items-v3/cloak.webp` | Накидка | Накидка |
| 3 | `items-v3/gloves.webp` | Рукавиці | Рукавиці |
| 4 | `items-v3/boots.webp` | Чоботи | Чоботи |
| 5 | `artifacts-v3/weapon.webp` | Копье мага → спис | Терновий спис* |
| 6 | `artifacts-v3/shield.webp` | Щит мага → щит | Дубова печать* |
| 7 | `artifacts-v3/relic.webp` | Зеркало магии → дзеркало | Криве люстро* |
| 8 | `artifacts-v3/amulet.webp` | Амулет жизни → ладанка | Ладанка подиху* |
| 9 | `artifacts-v3/voodoo.webp` | Кукла Вуду → мотанка | Лиха мотанка |
| 10–15 | `rarity-v3/{common,uncommon,rare,epic,legendary,mythic}.webp` | Фон рідкості під предметом | — |

\* Назви з варіанта 1. Промпти малюють сам предмет, тож якщо назва зміниться, предмет лишається тим самим.

Артефакти стихії не мають, тож шейдер їх не фарбує: вони лишаються туш + крем.

### Вимоги до файлів

- Предмети: квадрат 1:1, прозорий фон, PNG з альфою. Після обробки — 512×512 webp.
- Фони рідкості: квадрат 1:1, непрозорі, без предмета. Після обробки — 512×512 webp.
- Без тексту, цифр, рамок картки, підписів і водяних знаків.

### Як працюватиме шейдер стихії (для інтеграції)

Пікселі, близькі до кремового (`#efe2c4`), множаться на колір стихії, а темні (туш) не змінюються. Тому в предметах потрібна **рівна, однотонна кремова заливка** без градієнтів. Тоді вогонь, вода, земля й повітря виходять з одного файлу.

## Спільний блок стилю для предметів

Цей блок уже вставлено в кожен промпт нижче, окремо копіювати не треба.

> Style: dark gothic tarot woodcut, like an old hand-carved medieval block print. Pure black ink only: heavy solid black shapes next to clean empty light areas, rough hand-cut contour lines, bold parallel hatching and crude cross-hatching, large simple forms with few small details, no grey tones, no gradients, no airbrush. All light areas inside the object are filled with one flat, even warm cream paper colour (#efe2c4), the same cream everywhere, so the object is opaque and can be recoloured later. Single isolated object, centred, drawn a little smaller than usual with generous empty transparent space on all four sides; nothing touches or is cut by the canvas edge. Fully transparent background, PNG with alpha, clean outer silhouette readable at 48 pixels. No frame, no plate, no background scenery, no glow, no coloured light, no letters, no numbers, no runes that look like text, no logo, no signature, no watermark. Square 1:1 canvas.

## Промпти предметів

### 1. Каптур — `head`

```text
Generate a new image. A wanderer-mage's hood shown on its own, no head inside: a deep pointed cowl of thick woven wool with a long drooping tip falling to one side, a wide stitched hem around the face opening, and a short shoulder cape with a jagged cut edge; the face opening is a solid black void. Three-quarter front view, slightly from above. Style: dark gothic tarot woodcut, like an old hand-carved medieval block print. Pure black ink only: heavy solid black shapes next to clean empty light areas, rough hand-cut contour lines, bold parallel hatching and crude cross-hatching, large simple forms with few small details, no grey tones, no gradients, no airbrush. All light areas inside the object are filled with one flat, even warm cream paper colour (#efe2c4), the same cream everywhere, so the object is opaque and can be recoloured later. Single isolated object, centred, drawn a little smaller than usual with generous empty transparent space on all four sides; nothing touches or is cut by the canvas edge. Fully transparent background, PNG with alpha, clean outer silhouette readable at 48 pixels. No frame, no plate, no background scenery, no glow, no coloured light, no letters, no numbers, no runes that look like text, no logo, no signature, no watermark. Square 1:1 canvas.
```

### 2. Накидка — `cloak`

```text
Generate a new image. An empty travelling mantle hanging in the air as if worn by an invisible person: a heavy cloak with a high stiff collar, a round clasp brooch on the chest, and long folds that flare out and end in a tattered, torn hem. Front view, gently swaying to the left. Style: dark gothic tarot woodcut, like an old hand-carved medieval block print. Pure black ink only: heavy solid black shapes next to clean empty light areas, rough hand-cut contour lines, bold parallel hatching and crude cross-hatching, large simple forms with few small details, no grey tones, no gradients, no airbrush. All light areas inside the object are filled with one flat, even warm cream paper colour (#efe2c4), the same cream everywhere, so the object is opaque and can be recoloured later. Single isolated object, centred, drawn a little smaller than usual with generous empty transparent space on all four sides; nothing touches or is cut by the canvas edge. Fully transparent background, PNG with alpha, clean outer silhouette readable at 48 pixels. No frame, no plate, no background scenery, no glow, no coloured light, no letters, no numbers, no runes that look like text, no logo, no signature, no watermark. Square 1:1 canvas.
```

### 3. Рукавиці — `gloves`

```text
Generate a new image. A pair of empty spell-caster's gauntlet gloves of thick stitched leather, crossed over each other: long flared cuffs laced with cord, riveted plates on the knuckles. Each glove has exactly five fingers: one thumb and four fingers, naturally curved, no extra or missing fingers. Style: dark gothic tarot woodcut, like an old hand-carved medieval block print. Pure black ink only: heavy solid black shapes next to clean empty light areas, rough hand-cut contour lines, bold parallel hatching and crude cross-hatching, large simple forms with few small details, no grey tones, no gradients, no airbrush. All light areas inside the object are filled with one flat, even warm cream paper colour (#efe2c4), the same cream everywhere, so the object is opaque and can be recoloured later. Single isolated object, centred, drawn a little smaller than usual with generous empty transparent space on all four sides; nothing touches or is cut by the canvas edge. Fully transparent background, PNG with alpha, clean outer silhouette readable at 48 pixels. No frame, no plate, no background scenery, no glow, no coloured light, no letters, no numbers, no runes that look like text, no logo, no signature, no watermark. Square 1:1 canvas.
```

### 4. Чоботи — `boots`

```text
Generate a new image. A pair of tall worn wanderer's boots standing side by side, one turned slightly: soft folded leather shafts reaching the knee, a wide cuff turned down, a buckle strap across the ankle, thick stitched soles with a small heel, scuffed toes. Three-quarter side view. Style: dark gothic tarot woodcut, like an old hand-carved medieval block print. Pure black ink only: heavy solid black shapes next to clean empty light areas, rough hand-cut contour lines, bold parallel hatching and crude cross-hatching, large simple forms with few small details, no grey tones, no gradients, no airbrush. All light areas inside the object are filled with one flat, even warm cream paper colour (#efe2c4), the same cream everywhere, so the object is opaque and can be recoloured later. Single isolated object, centred, drawn a little smaller than usual with generous empty transparent space on all four sides; nothing touches or is cut by the canvas edge. Fully transparent background, PNG with alpha, clean outer silhouette readable at 48 pixels. No frame, no plate, no background scenery, no glow, no coloured light, no letters, no numbers, no runes that look like text, no logo, no signature, no watermark. Square 1:1 canvas.
```

### 5. Терновий спис — `weapon` (Копье мага: + урон)

```text
Generate a new image. A short mage's spear drawn diagonally from lower left to upper right: a twisted blackthorn shaft covered in sharp thorns, wrapped with cord near the grip, ending in a long leaf-shaped blade of black stone with a carved central ridge; a small bundle of feathers tied under the blade. Style: dark gothic tarot woodcut, like an old hand-carved medieval block print. Pure black ink only: heavy solid black shapes next to clean empty light areas, rough hand-cut contour lines, bold parallel hatching and crude cross-hatching, large simple forms with few small details, no grey tones, no gradients, no airbrush. All light areas inside the object are filled with one flat, even warm cream paper colour (#efe2c4), the same cream everywhere, so the object is opaque. Single isolated object, centred, drawn a little smaller than usual with generous empty transparent space on all four sides; nothing touches or is cut by the canvas edge. Fully transparent background, PNG with alpha, clean outer silhouette readable at 48 pixels. No frame, no plate, no background scenery, no glow, no coloured light, no letters, no numbers, no runes that look like text, no logo, no signature, no watermark. Square 1:1 canvas.
```

### 6. Дубова печать — `shield` (Щит мага: − вхідний урон)

```text
Generate a new image. A round mage's shield of thick oak planks seen from the front: iron rim with big rivets, a carved wax-seal style emblem in the centre showing a simple closed eye inside a ring, wood grain cut in bold lines, one crack across the lower edge. Style: dark gothic tarot woodcut, like an old hand-carved medieval block print. Pure black ink only: heavy solid black shapes next to clean empty light areas, rough hand-cut contour lines, bold parallel hatching and crude cross-hatching, large simple forms with few small details, no grey tones, no gradients, no airbrush. All light areas inside the object are filled with one flat, even warm cream paper colour (#efe2c4), the same cream everywhere, so the object is opaque. Single isolated object, centred, drawn a little smaller than usual with generous empty transparent space on all four sides; nothing touches or is cut by the canvas edge. Fully transparent background, PNG with alpha, clean outer silhouette readable at 48 pixels. No frame, no plate, no background scenery, no glow, no coloured light, no letters, no numbers, no runes that look like text, no logo, no signature, no watermark. Square 1:1 canvas.
```

### 7. Криве люстро — `relic` (Зеркало магии: − урон і відбиття)

```text
Generate a new image. A small crooked hand mirror standing upright: an uneven, slightly warped oval glass in a gnarled root-wood frame with a twisted handle; the glass shows bold black zigzag cracks that split one strike-line into two directions, as if a blow bounced off it. Style: dark gothic tarot woodcut, like an old hand-carved medieval block print. Pure black ink only: heavy solid black shapes next to clean empty light areas, rough hand-cut contour lines, bold parallel hatching and crude cross-hatching, large simple forms with few small details, no grey tones, no gradients, no airbrush. All light areas inside the object are filled with one flat, even warm cream paper colour (#efe2c4), the same cream everywhere, so the object is opaque. Single isolated object, centred, drawn a little smaller than usual with generous empty transparent space on all four sides; nothing touches or is cut by the canvas edge. Fully transparent background, PNG with alpha, clean outer silhouette readable at 48 pixels. No frame, no plate, no background scenery, no glow, no coloured light, no letters, no numbers, no runes that look like text, no logo, no signature, no watermark. Square 1:1 canvas.
```

### 8. Ладанка подиху — `amulet` (Амулет жизни: відродження)

```text
Generate a new image. A folk-magic locket pendant hanging on a short knotted cord: a small rounded metal case with a hinged lid half open, from inside rises a thin curl of breath-like smoke shaped as a single feather; tiny bead and knot details on the cord. Style: dark gothic tarot woodcut, like an old hand-carved medieval block print. Pure black ink only: heavy solid black shapes next to clean empty light areas, rough hand-cut contour lines, bold parallel hatching and crude cross-hatching, large simple forms with few small details, no grey tones, no gradients, no airbrush. All light areas inside the object are filled with one flat, even warm cream paper colour (#efe2c4), the same cream everywhere, so the object is opaque. Single isolated object, centred, drawn a little smaller than usual with generous empty transparent space on all four sides; nothing touches or is cut by the canvas edge. Fully transparent background, PNG with alpha, clean outer silhouette readable at 48 pixels. No frame, no plate, no background scenery, no glow, no coloured light, no letters, no numbers, no runes that look like text, no logo, no signature, no watermark. Square 1:1 canvas.
```

### 9. Лиха мотанка — `voodoo` (Кукла Вуду: прокляття вбивці)

```text
Generate a new image. A faceless folk rag doll made of wrapped and knotted cloth, no sewing: a round wrapped head with no face, a cross of thread wound over the blank face area, a headscarf, arms made of one rolled strip, a long skirt of layered rags; a long iron needle pierces it diagonally and a loose thread trails down. Eerie but simple. Style: dark gothic tarot woodcut, like an old hand-carved medieval block print. Pure black ink only: heavy solid black shapes next to clean empty light areas, rough hand-cut contour lines, bold parallel hatching and crude cross-hatching, large simple forms with few small details, no grey tones, no gradients, no airbrush. All light areas inside the object are filled with one flat, even warm cream paper colour (#efe2c4), the same cream everywhere, so the object is opaque. Single isolated object, centred, drawn a little smaller than usual with generous empty transparent space on all four sides; nothing touches or is cut by the canvas edge. Fully transparent background, PNG with alpha, clean outer silhouette readable at 48 pixels. No frame, no plate, no background scenery, no glow, no coloured light, no letters, no numbers, no runes that look like text, no logo, no signature, no watermark. Square 1:1 canvas.
```

## Фони рідкості

Один фон на рідкість, без предмета. Предмет ставиться поверх у центр, тому центр має бути спокійним, а прикраси — тільки по краях. Від рідкості до рідкості прикраси багатшають: так рідкість читається навіть без кольору. Кольори відповідають `EQUIPMENT_RARITY_CONFIG`.

### Спільний блок стилю для фонів

> Style: hand-painted aged parchment tile in sepia, bronze and black ink, woodcut-style ornament with rough hand-cut lines and bold hatching. The centre 60% of the tile is calm, plain, slightly lighter parchment with no pattern, because an object will be placed there later. Ornament only along the border. Square 1:1, edge to edge, no transparent areas, no object, no creature, no letters, no numbers, no text, no logo, no watermark.

### 10. Звичайна — `common` (#a7a39b)

```text
Generate a new image. An empty square tile for an inventory slot: plain worn parchment with a single thin black ink border line and four tiny nail marks in the corners; the parchment has a faint cool grey wash. Style: hand-painted aged parchment tile in sepia, bronze and black ink, woodcut-style ornament with rough hand-cut lines and bold hatching. The centre 60% of the tile is calm, plain, slightly lighter parchment with no pattern, because an object will be placed there later. Ornament only along the border. Square 1:1, edge to edge, no transparent areas, no object, no creature, no letters, no numbers, no text, no logo, no watermark.
```

### 11. Незвичайна — `uncommon` (#78ad86)

```text
Generate a new image. An empty square tile for an inventory slot: worn parchment with a double black ink border and a thin vine of small leaves running along the border; the border and the outer edge carry a soft muted sage-green wash, the centre stays plain parchment. Style: hand-painted aged parchment tile in sepia, bronze and black ink, woodcut-style ornament with rough hand-cut lines and bold hatching. The centre 60% of the tile is calm, plain, slightly lighter parchment with no pattern, because an object will be placed there later. Ornament only along the border. Square 1:1, edge to edge, no transparent areas, no object, no creature, no letters, no numbers, no text, no logo, no watermark.
```

### 12. Рідкісна — `rare` (#72a9d4)

```text
Generate a new image. An empty square tile for an inventory slot: parchment with a double ink border, small bronze corner caps, and a wave-and-droplet ornament along the border; the border and the outer edge carry a muted cornflower-blue wash, the centre stays plain parchment. Style: hand-painted aged parchment tile in sepia, bronze and black ink, woodcut-style ornament with rough hand-cut lines and bold hatching. The centre 60% of the tile is calm, plain, slightly lighter parchment with no pattern, because an object will be placed there later. Ornament only along the border. Square 1:1, edge to edge, no transparent areas, no object, no creature, no letters, no numbers, no text, no logo, no watermark.
```

### 13. Епічна — `epic` (#ad8bd0)

```text
Generate a new image. An empty square tile for an inventory slot: parchment with a carved bronze frame, pointed gothic corner pieces, and a border of interlaced knots and tiny star points; the frame and the outer edge carry a muted lilac-violet wash, the centre stays plain parchment with a very faint vignette. Style: hand-painted aged parchment tile in sepia, bronze and black ink, woodcut-style ornament with rough hand-cut lines and bold hatching. The centre 60% of the tile is calm, plain, slightly lighter parchment with no pattern, because an object will be placed there later. Ornament only along the border. Square 1:1, edge to edge, no transparent areas, no object, no creature, no letters, no numbers, no text, no logo, no watermark.
```

### 14. Легендарна — `legendary` (#d4a65e)

```text
Generate a new image. An empty square tile for an inventory slot: parchment inside a rich gilded bronze frame with sunburst rays engraved in the corners, a laurel border and small round gems set at the middle of each side; warm amber-gold wash on the frame and a soft warm halo fading toward the calm centre. Style: hand-painted aged parchment tile in sepia, bronze and black ink, woodcut-style ornament with rough hand-cut lines and bold hatching. The centre 60% of the tile is calm, plain, slightly lighter parchment with no pattern, because an object will be placed there later. Ornament only along the border. Square 1:1, edge to edge, no transparent areas, no object, no creature, no letters, no numbers, no text, no logo, no watermark.
```

### 15. Міфічна — `mythic` (#e48172)

```text
Generate a new image. An empty square tile for an inventory slot: parchment inside a heavy ornate frame of dark bronze and black ink with flame-like tendrils curling inward from the corners, a thorned crown motif at the top centre and four large red gems in the corners; a deep coral-red wash on the frame and a faint ember glow fading toward the calm centre. Style: hand-painted aged parchment tile in sepia, bronze and black ink, woodcut-style ornament with rough hand-cut lines and bold hatching. The centre 60% of the tile is calm, plain, slightly lighter parchment with no pattern, because an object will be placed there later. Ornament only along the border. Square 1:1, edge to edge, no transparent areas, no object, no creature, no letters, no numbers, no text, no logo, no watermark.
```

## Перевірка готових картинок

- Предмет повністю в кадрі, з полями з усіх боків, фон прозорий.
- Заливка однотонна кремова, без градієнтів (інакше шейдер стихії дасть плями).
- Силует читається в 48 px.
- Рукавиці: на кожній рівно п'ять пальців.
- Фон рідкості: центр спокійний, прикраси по краях, рідкості помітно відрізняються одна від одної навіть у сірому.
