# Спрайти кубків і медалей турніру

**Статус:** 25 PNG згенеровані локально; кожен 512×512 RGBA з прозорим фоном. Вихідні сітки й контактний аркуш лежать у `.runtime/generated-art/tournament-awards/`.

У референсі кожна ліга має свої кубки за 1–4 місця й окремі медалі за 1/4 та 1/8. Медаль учасника спільна для всіх ліг. Дані вже зберігаються: `tournament_entries.prize.badge` (`cup_1`…`cup_4`, `quarterfinal`, `eighthfinal`, `participant`) і ліга події. П’єдестал показує кубок за місце, а профільну шафу заповнюють зароблені кубки й медалі.

Стиль задає наявний `client/public/assets/ui/profile/tournament-trophy.png`: мальований метал, гравірування, гранований камінь, м’яке світло зверху, прозорий фон. Від референсу береться лише механіка, не вигляд.

## Набір — 25 файлів

На кожну з чотирьох ліг шість спрайтів. Колір каменя відповідає лізі (як `accentColor` у `shared/src/leagues.ts`):

| Ліга | Ключ | Камінь |
| --- | --- | --- |
| Підкорювачі | `conqueror` | аметист, фіолетовий |
| Чемпіони | `champion` | бурштин, медово-золотий |
| Майстри | `master` | корал, теракотовий |
| Володарі | `ruler` | рубін, темно-червоний |

Файли: `client/public/assets/ui/tournament/awards/<league>-<badge>.png`, наприклад `champion-cup_1.png`, `master-quarterfinal.png`. Медаль учасника — `participant.png`.

- `cup_1` — золотий кубок, найбагатший, великий камінь.
- `cup_2` — срібний кубок.
- `cup_3` — бронзовий кубок.
- `cup_4` — кубок із темного заліза з мідними вставками.
- `quarterfinal` — медаль за 1/4 на стрічці, камінь ліги, лаврова гілка.
- `eighthfinal` — простіша медаль за 1/8 на стрічці, менший камінь.

Кубки — квадратне полотно 512×512 і однаковий силует у межах ліги, щоб у сітці вони стояли рівно. Медалі — 512×512 зі стрічкою зверху.

## Промпт для ліги (повторити 4 рази, підставивши ліґу й камінь)

```text
Game UI sprite sheet on a fully transparent background, 3 columns x 2 rows, each cell 512x512, generous empty margin, no text, no labels, no grid lines.
Hand-painted fantasy metal craft, same style as a polished painted trophy: engraved metal, soft top light, crisp dark outline, faceted gemstone, slight bevel. Light parchment-book game, so no dark glow or black backdrop.
League gem for this whole sheet: {GEM, e.g. "violet amethyst"}.
Row 1: (1) gold two-handled tournament cup with a large {GEM} on the bowl, laurel engraving; (2) the same cup silhouette in silver with a medium {GEM}; (3) the same cup in bronze with a small {GEM}.
Row 2: (4) the same cup in dark iron with copper inlays and a small {GEM}; (5) round gold medal on a short ribbon, laurel branches around a {GEM}, marked as a quarter-final award by four small notches on the rim; (6) smaller round silver medal on a short ribbon with a small {GEM}, eight small notches on the rim.
Every object centered in its cell, front view, same scale for the four cups, same scale for the two medals. PNG with alpha.
```

## Промпт медалі учасника (один раз)

```text
Single game UI sprite, fully transparent background, 512x512, no text.
Hand-painted fantasy metal craft matching a polished painted trophy: simple round bronze participant medal on a short muted ribbon, small clear quartz gem in the center, thin engraved rim, soft top light, crisp dark outline. Centered, front view. PNG with alpha.
```

## Готові спрайти

Згенеровані чотири прозорі сітки 3×2 та окрема медаль учасника. 24 клітинки нарізані у точні PNG 512×512 без деформації; перевірені RGBA й прозорі кути. Усі 25 файлів лежать у `client/public/assets/ui/tournament/awards/`. П’єдестал турніру читає кубок місця, а профіль показує шафу виданих кубків і медалей.
