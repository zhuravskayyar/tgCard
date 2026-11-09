# Маг у профілі: спрайти й анімації

Стан на 2026-11-09. Мета — замінити чорний силует у профілі (`/assets/profile/mage-silhouette.webp`) на живого мага в нашому стилі: таро-ксилографія, чорна туш і кремова заливка, як нові спрайти спорядження.

## Що малюємо: 2 спрайти одного мага

| Файл | Поза | Навіщо |
|---|---|---|
| `profile/mage-idle-v1.webp` | Спокійна: стоїть, посох у руці, сфера вгорі | Основний стан профілю, на ньому постійні ефекти |
| `profile/mage-cast-v1.webp` | Закляття: посох піднятий, вільна рука витягнута вперед | Короткий «спалах» при дотику до мага: поза змінюється на ~1 с, вилітає ефект стихії |

Обидва спрайти мають однаковий масштаб і положення ніг, тому плавна заміна однієї пози на іншу не стрибає. Другий промпт треба надсилати **в тому самому чаті** після першого, щоб ChatGPT тримав того самого персонажа.

### Вимоги до файлів

- Полотно 2:3 (вертикальне), прозорий фон, PNG з альфою.
- Маг на всю висоту: каптур зверху з невеликим полем, ноги внизу з невеликим полем, по центру.
- Заливка однотонна кремова (`#efe2c4`). Шейдер перефарбовує крем у колір стихії так само, як на речах, тож мантія стає вогняною, водною, повітряною чи земляною з одного файлу.
- Сфера на посоху і очі в каптурі — однотонний світлий крем. На ці місця ляже світіння.
- Обличчя приховане тінню каптура (видно тільки два світлі очі), руки в рукавицях з п'ятьма пальцями.

## Анімації, які ляжуть на спрайт (CSS/SVG, без нових картинок)

1. **Колір стихії** — кремові ділянки мантії множаться на колір стихії.
2. **Фон стихії** — один із готових `bg-fire/water/air/earth.webp`.
3. **Дихання** — ледь помітне коливання вгору-вниз (2–3 px, 4 с).
4. **Сфера** пульсує світлом стихії; **очі** світяться і зрідка «кліпають».
5. **Поділ мантії** колишеться (SVG-хвиля тільки на нижній третині).
6. **Частинки стихії**: вогонь — іскри вгору; вода — бульбашки; повітря — смуги вітру; земля — пил і листя.
7. **Дотик** — поза «закляття» на ~1 с і сплеск частинок зі сфери.
8. `prefers-reduced-motion` — статичний маг без руху.

Стихія за замовчуванням — та, якої найбільше в бойовій колоді. Перемикач у налаштуваннях можна додати пізніше.

## Промпт 1 — `mage-idle`

```text
Generate a new image. A full-length wandering battle mage standing calmly, facing the viewer in a slight three-quarter turn: a tall pointed hood whose opening is a deep solid black shadow with only two small round cream eyes glowing inside, a long heavy robe with a layered shoulder cape, a wide belt with a round buckle and two small pouches, wide sleeves, gloved hands with exactly five fingers each. The right hand grips a tall gnarled wooden staff that stands on the ground beside the right foot and rises above the hood, crowned by a twisted root cage holding a smooth round orb. The left hand rests near the belt. The robe hem is long, slightly flared and ragged, ending just above worn boots. Proud, mysterious, adult figure. Tall, narrow silhouette that fits a slim vertical frame. Style: dark gothic tarot woodcut, like an old hand-carved medieval block print. Pure black ink only: heavy solid black shapes next to clean empty light areas, rough hand-cut contour lines, bold parallel hatching and crude cross-hatching, large simple forms with few small details, no grey tones, no gradients, no airbrush. All light areas of the figure are filled with one flat, even warm cream paper colour (#efe2c4), the same cream everywhere, so the figure is opaque and can be recoloured later; the orb and the eyes are plain flat cream too. Single isolated figure, centred, the whole body visible from hood tip to boots with a small empty margin above and below, nothing touches or is cut by the canvas edge. Fully transparent background, PNG with alpha, clean outer silhouette readable at 100 pixels tall. No frame, no ground, no scenery, no glow, no coloured light, no magic effects, no letters, no numbers, no runes, no logo, no signature, no watermark. Vertical 2:3 canvas.
```

## Промпт 2 — `mage-cast` (у тому самому чаті, одразу після першого)

```text
Generate a new image of the exact same mage from the previous image — same hood, eyes, robe, cape, belt, staff, boots, same style, same size on the canvas and the same position of the feet — now casting a spell: the right hand raises the staff high and slightly forward so the orb is above and in front of the hood, the left arm is stretched forward with the open gloved palm toward the viewer (exactly five fingers: one thumb and four fingers), the robe hem and cape sweep to one side as if pushed by a gust, the two cream eyes in the black hood are wider. Style: dark gothic tarot woodcut, like an old hand-carved medieval block print. Pure black ink only: heavy solid black shapes next to clean empty light areas, rough hand-cut contour lines, bold parallel hatching and crude cross-hatching, large simple forms with few small details, no grey tones, no gradients, no airbrush. All light areas of the figure are filled with one flat, even warm cream paper colour (#efe2c4), the same cream everywhere; the orb and the eyes are plain flat cream too. Single isolated figure, centred, the whole body visible from hood tip to boots with a small empty margin above and below, nothing touches or is cut by the canvas edge. Fully transparent background, PNG with alpha. No frame, no ground, no scenery, no glow, no coloured light, no magic effects or sparks (effects are added later), no letters, no numbers, no runes, no logo, no signature, no watermark. Vertical 2:3 canvas.
```

## Перевірка готових картинок

- Обидві пози — той самий персонаж, ноги на тій самій висоті й місці.
- Фон прозорий, фігура цілком у кадрі.
- Крем однотонний, без градієнтів; сфера й очі — чистий крем.
- На кожній руці п'ять пальців.
- Силует читається у вузькій рамці профілю (~92 px завширшки).
