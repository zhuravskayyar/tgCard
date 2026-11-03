# elem.mobi: campaigns (reference, 1:1 logic)

Source: in-game manual `https://elem.mobi/forum/3/218036/` and its per-location posts,
plus a live run of location 1 on 02.11.2026. Names below are the reference's; Cardastika
uses its own names and parchment art, only the logic is copied.

## Rules

- Ten locations in a fixed order. A location opens when all its trials are claimed; then
  its boss can be fought.
- Passing a campaign = all its trials + the first boss win. The next location (with its
  own story and trials) appears after that.
- Each trial pays a small gold + silver reward when claimed. The first boss win pays a
  bigger gold + silver reward and a card; every later win after respawn pays only a card.
- Bosses respawn after a fixed time. At most three locations can be refought at once
  (the three most recent passed ones).
- Most trials count all progress since the start of the game, so they may already be
  done when the location opens. Trials worded "ще / more" (and a few listed below) count
  only from the end of the previous campaign.
- Higher card quality counts for quality trials (9 epic accepts legendary and mythic).
- Boss fight = a duel where the boss cards are hidden (card backs). Extra deck cards do
  not take part.
- Passing campaigns is shown in the player profile. The daily task "get 3 cards in the
  campaign" counts boss card drops.

## Screens

- **Campaign map** (`/dungeon/`): a dotted path of locations, newest on top. The current
  location shows `Пройдите испытания!` and a `Награда!` button while trials are
  claimable; once open it shows `Бить босса`. Passed locations show the respawn timer or
  `Бить босса`. A `Задания` (daily tasks) row sits under the map.
- **Story** (`/story/`): portrait of the quest giver, a two-line plea, `Прогресс испытаний:
  N из M`, the rule `Чтобы пройти <location>, пройдите все испытания.`, then one plate
  per trial: title, `Испытание пройдено!` or `Прогресс: x из y`, reward, and either
  `Забрать награду` or a button to the place where the trial is done. A `Кампания` link
  at the bottom. Each claimed trial adds a `Пройдено испытание из приключения «…»` notice.
- **Boss result**: quest giver's thanks, `Награда: gold silver` (first win only),
  `Победа`, `Вы добыли карту!` with the card (and `Карта упала в слабые` when weak),
  `Вы сможете вновь сразиться с <boss> через N ч.`, `Новое приключение`, battle log,
  `Задания`.

## Locations

| # | Location | Giver's plea | Trials | Per-trial reward (gold / silver) | Boss | Boss HP | Respawn | First win (gold / silver) | Card drop |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Пещеры гоблинов | Goblins took my sister; beat the Goblin Champion. | Win the first duel; play 10 duels; buy 4 cards in the shop; upgrade cards 3 times; pick a name (10 gold) | 1 / 100 | Гоблин-чемпион | 1 436 | 2 h | 10 / 2 000 | lvl 14, rare, 250–300 |
| 2 | Ущелье ветров | Elementals took the eagles' gorge. | Collect the «Elementals» collection; 50 duel wins; get 10 gold in duels; 9 epic cards in the deck; 12 daily tasks | 2 / 200 | Смертельный вихрь | 6 513 | 4 h | 20 / 5 000 | lvl 20, epic, 500–600 |
| 3 | Бородатая гора | The dwarf king stole my ancestors' gold. | Deck power 14 000; 9 legendary cards in the deck; duel rating 1 800; get 20 cards in the campaign | 3 / 300 | Король гномов | 15 453 | 10 h | 30 / 10 000 | lvl 40, legendary, 1 560–1 872 |
| 4 | Опасное озеро | Mermaids robbed my nest. | 300 duel wins; get 400 cards; deck power 22 000; duel rating 2 250; earn 1 000 gold | 4 / 400 | Озерная царевна | 25 001 | 20 h | 40 / 25 000 | lvl 53, legendary, 2 320–2 784 |
| 5 | Башня магов | A mad air mage burns the forest. | Earn 500 000 silver; absorb 1 000 cards; duel rating 2 850; 9 mythic cards in the deck; collect «Ancient Dragons» | 5 / 500 | Верховный маг | 40 646 | 20 h | 50 / 50 000 | lvl 65, mythic, 3 430–4 116 |
| 6 | Ловушка орков | Orcs hold a dryad captive. | Collect «Mythic creatures»; deck power 44 000; duel rating 3 200; reach level 60; spend 500 diamonds; 20 more raid monsters; earn 2 000 diamonds | 6 / 600 | Уррх Черный Зуб | 55 708 | 20 h | 60 / 100 000 | lvl 70, mythic, 3 980–4 776 |
| 7 | Тихий омут | A hydra hunts my sisters. | Reach level 70; 100M guild XP; donate 100K elements to the guild card; earn 7M silver; earn 12 000 gold; duel rating 3 600; collect «Rare dragons» | 7 / 700 | Трофимейская гидра | 70 230 | 20 h | 70 / 250 000 | lvl 75, mythic, 4 580–5 496 |
| 8 | Замок драконов | Help steal the Golden Dragon's egg. | Give 50 gifts; put 5 000 gold in the guild treasury; arena rating 3 600; duel rating 3 900; win a mythic tournament cup; earn 10 000 diamonds; collect «High mages» | 8 / 800 | Великий дракон Снагус | 85 000 | 20 h | 80 / 500 000 | lvl 80, mythic, 5 230–6 276 |
| 9 | Фабрика гоблинов | Goblins built a meat grinder. | Reach level 90; duel rating 4 300 (since previous); open one more 15th chest; one more master-tournament win; 9M more guild-arena damage; 99M more invasion damage; one card of «Witches» | 9 / 900 | Мясорубка гоблинов | 101 878 | 20 h | 90 / 1 000 000 | lvl 85, mythic, 5 980–7 176 |
| 10 | Плато троллей | We need trolls as engines for the spiked wheel. | 300 more diamonds in weekly marathons; collect «Urfin's generals»; two «Witches» cards; any master cup or 1/4–1/8 medal; duel rating 4 400 (since previous); 5 more invasion damage cards; beat all guild-raid dragons solo | 10 / 1 000 | Тролль из Южных гор | 116 105 | 20 h | 100 / 2 000 000 | lvl 90, mythic, 6 260–7 512 |

Boss decks are nine cards (3×3), in the order shown on each forum page:

1. `86, 90, 93 / 120, 252, 257 / 289, 125, 124` — sum 1,436.
2. `356, 510, 981 / 525, 529, 1,002 / 529, 546, 994` — sum 5,972.
3. `976, 1,131, 1,575 / 1,811, 1,859, 2,209 / 2,235, 2,681, 2,859` — sum 17,336.
4. `2,228, 2,957, 2,432 / 2,444, 2,534, 2,722 / 4,550, 2,406, 2,728` — sum 25,001.
5. `3,643, 4,059, 3,700 / 3,940, 3,873, 5,860 / 5,925, 3,494, 6,152` — sum 40,646.
6. `5,197, 5,460, 4,868 / 7,098, 5,335, 8,626 / 8,028, 5,955, 5,144` — sum 55,711.
7. `6,005, 8,848, 7,218 / 6,866, 10,519, 8,003 / 6,097, 7,786, 8,888` — sum 70,230.
8. `9,350, 10,060, 9,580 / 9,058, 9,778, 8,085 / 10,385, 8,508, 10,268` — sum 85,072.
9. `10,967, 11,579, 12,622 / 12,180, 10,639, 10,929 / 10,291, 10,096, 12,575` — sum 101,878.
10. `12,723, 13,339, 13,933 / 13,333, 11,920, 12,605 / 12,738, 12,983, 12,531` — sum 116,105.

The forum lists HP values of 6,513, 15,453, 55,708 and 85,000 for locations 2, 3, 6 and 8, respectively. Those values do not equal the displayed card-power sums; the implementation follows the campaign rule that boss HP is the sum. The other six forum HP values match their decks. Per-location pages: [2](https://elem.mobi/forum/3/18991/), [3](https://elem.mobi/forum/3/18992/), [4](https://elem.mobi/forum/3/18993/), [5](https://elem.mobi/forum/3/18994/), [6](https://elem.mobi/forum/3/30788/), [7](https://elem.mobi/forum/3/30789/), [8](https://elem.mobi/forum/3/36738/), [9](https://elem.mobi/forum/3/227079/), [10](https://elem.mobi/forum/3/227827/).
