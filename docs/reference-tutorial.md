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

Cardastika follows the reference order for onboarding:

1. A new eligible player is sent directly to the first duel. The first card is
   the only enabled action, then only the second, then all of them.
2. The victory CTA is `За нагородою`. It ends the mandatory tutorial and opens
   the story trials at `/trials`. There is no step counter, and the player can
   move freely afterwards.
3. Five server-owned trials are defined in `server/src/trials/storyTrialsConfig.ts`.
   Progress comes from `player_campaign_events`; rewards go through
   `POST /api/player/trials/:id/claim`, once per player.
4. `Збережи ігровий профіль` pays 500 gold when a guest links Google or Telegram.
   A player who already has an identity claims it on the trials screen. A player
   who received the old 5 diamond reward sees it as claimed and gets no gold.
5. The campaign stays closed until all five rewards are claimed: `/campaign`
   shows the locked hub and `POST /api/player/campaign/quests/:id/claim` returns
   `409 campaign_locked`. Players who have already claimed a campaign quest keep
   access. The inside of the campaign is still the existing six stages.

## Walkthrough recorded on 2026-10-30

A fresh guest profile, created automatically by `/tutorial/` with no form and no
personal data. Not registered, so everything behind `Сохранить` is unobserved.

### Opening duel

| Step | Enemy HP | Player HP | Available cards | Dialogue |
| --- | --- | --- | --- | --- |
| Start | 35 | 180 | 1, middle, arrow | Cards below, enemy above, attack |
| After hit 1 | 23 | 168 | 1, left, arrow | Crits are 1.5x stronger |
| After hit 2 | 5 | 162 | 3, any | Finish with any card |

All cards have power 12, except one that appears at the last step with 84. That
card guarantees the player sees a big number. Victory gives 100 silver and 35
rating, `Побед в дуэлях: 1`, one dialogue line and the single CTA `За наградой`.

### Story screen `/story/` (title `Помогите феям!`)

Fairy portrait with a two-line story: goblins captured her sister, beat the Goblin
Champion to free her. Below it: `Прогресс испытаний: N из 5` with a bar, and the
rule that all trials must be passed to enter the Goblin Caves.

| # | Trial | Reward | Button |
| --- | --- | --- | --- |
| 1 | Win the first duel | 1 gold, 100 silver | `Забрать награду` |
| 2 | Play 10 duels | 1 gold, 100 silver | `Дуэли` |
| 3 | Buy 4 cards in the shop | 1 gold, 100 silver | `Магазин` |
| 4 | Upgrade cards 3 times | 1 gold, 100 silver | `Боевая колода` |
| 5 | Save the game profile | 500 gold | `Сохранить` |

- The active trial is a parchment plate with a gold or green CTA and a progress
  bar. The others are dark plates with a blue CTA.
- A claimed trial disappears from the list, and the next one becomes the
  parchment plate. Claiming did not change `1 из 5` until the next trial is done.
- Reward counters change in the top bar immediately after the claim.
- `Сыграйте 10 дуэлей` went up by one per finished duel. All three were wins, so
  whether losses count is unobserved. An unfinished duel did not count.

### Campaign hub `/dungeon/#last`

Available straight after the first claim, as a link under the trials. It holds a
painted map plate with the Goblin Caves icon, the line `Пройдите испытания!` and
one green `Испытания` button that returns to `/story/`, then a `Задания` row. The
campaign itself stays closed until all 5 trials are done.

### Save profile `/register/`

Title `Сохранение игрового профиля`. Fields: in-game name, password, e-mail, plus
two required consent checkboxes (licence and privacy, personal data processing),
and `Сохранить` stays disabled until filled. It promises 500 gold for saving and
another 500 gold through a link sent to the e-mail. A warning explains that the
e-mail is only for password recovery, and recovery is impossible without it.
The home screen also repeats the 500 gold offer as a hint at the bottom.

### Surrounding screens

- **Duel `/duel/`:** enemy silhouette, name and HP, `Напасть` and `Искать еще`,
  10 duels available. Regular duels give 100 silver and 68-70 rating on a win. The
  result screen has `Еще дуэль` and a short `Итоги боя` log.
- **Shop `/shop/cards/`:** a one-time set of 4 cards for 20 gold, then single cards:
  legendary 150 gold, epic 50 gold, uncommon 500 silver, each with a stated chance
  of the next rarity. The chance grows with each purchase.
- **Deck `/deck/`:** 9 cards in a 3x3 grid, three locked bonus slots (ally, guild,
  goblin), a line pointing at the daily task and a count of weak cards.
- **Card `/card/:id/`:** `Поднять уровень` costs 1 gold for +10 power and asks for
  `Да!` / `Нет` first. A weak card can be absorbed to cut the price, +16% here.
- **Home `/`:** the trial is a large tile beside duels and the deck. Locked modes
  such as tournament and arena are shown dimmed rather than hidden.

### Not observed

- Trial completion after trial 1, and what appears at `5 из 5`.
- Inside the Goblin Caves: stages, battles, the Goblin Champion, rewards.
- Anything after registering, including the e-mail bonus.
