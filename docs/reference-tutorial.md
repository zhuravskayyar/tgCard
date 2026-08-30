# Reference tutorial notes

Source checked on 2026-08-30: [elem.mobi](https://elem.mobi/start/).

## Observed route

1. `/start/` is a compact landing page. The main CTA is `Начать игру` and
   opens `/tutorial/`.
2. `/tutorial/` opens directly into the first duel. The screen shows the enemy
   above, the player's character below, six cards in a 3x2 board, elemental
   multipliers (`x 1.5`, `x 1`, `x 0.5`), and one yellow dialogue bubble:
   `Ваши карты внизу. Противника — наверху. Бейте своей картой!`
3. The first attack changes the state to enemy `23` HP and player `168` HP.
   The next dialogue explains the important rule in one sentence:
   `Критические удары в 1,5 раза сильнее! Бейте!`
4. The second attack changes the state to enemy `5` HP and player `162` HP.
   Three available cards point to the same final attack and the dialogue says:
   `Добейте врага любой картой!`
5. Any final card opens the victory state. It shows `Победа`, the received
   rewards (`100` and `35`), `Побед в дуэлях: 1`, and one CTA: `За наградой`.
6. The reward CTA opens `/story/`. The story screen explains the immediate
   goal (`Помогите феям!`), gives the narrative reason, and shows
   `Прогресс испытаний: 1 из 5`. The completed first challenge is visible with
   `Испытание пройдено!`, its reward, and `Забрать награду`; the remaining
   challenges show progress and direct destinations such as `Дуэли`, `Магазин`,
   `Боевая колода`, and `Сохранить`.
7. After claiming the first reward, the story page exposes the `Кампания`
   destination to `/dungeon/#last`. The campaign hub shows `Пещеры гоблинов`,
   the short instruction `Пройдите испытания!`, and a single highlighted
   `Испытания` CTA.

## Visual and copy rules worth preserving

- The tutorial has no `step / total` counter. It presents one current action
  at a time and lets the duel state itself communicate progress.
- Dialogue sits in a dark navy panel with a high-contrast yellow copy. The copy
  is short, left-aligned, and uses a single clear imperative.
- The current target is obvious from a bright highlight, arrow, or card state;
  the surrounding UI is darker but still recognizable.
- The sequence is finite only for the opening duel. The story and Campaign then
  become the ongoing progression route.

## Cardastika application

Cardastika now follows the reference order for the mandatory onboarding:

1. A new eligible player is sent directly to the first duel.
2. The first card is the only enabled action. The dialogue says:
   `Твої карти внизу. Карти суперника — вгорі. Атакуй своєю картою!`
3. After the first exchange, only the second card is enabled. The dialogue
   says: `Критичні удари в 1,5 раза сильніші! Атакуй!`
4. After the second exchange, all cards are enabled. The dialogue says:
   `Добий ворога будь-якою картою!`
5. The victory CTA is `ЗА НАГОРОДОЮ` and opens the Campaign route. There is no
   numbered step counter and no intermediate mandatory shop or collection
   screen.

The duel dialogue uses the reference presentation: a dark navy panel, a
readable yellow sentence, the NPC portrait, and one highlighted current
target. During the mandatory route, navigation and direct URLs return the
player to the current duel. Once the Campaign starts, deck, Duel, shop, weak
cards, and collections are available as campaign actions; unrelated modes are
redirected back to Campaign. Campaign completion ends the mandatory route.
