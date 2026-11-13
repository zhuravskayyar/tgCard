# elem.mobi: guild raids (dragons and witches)

Our own summary, for mechanics only. Never take its visual style, art or copy.
Sources: manual pages `/forum/3/220651/` (dragons) and `/forum/3/224901/` (witches),
checked on 2026-11-13. Older capture of the witch page: `reference-elem-witches-raids.json`.

## Shared rules

- A raid is a fight of one guild against guild bosses. Players enroll; only one raid at a time per player.
- The raid leader opens it: the highest-ranked enrolled player, ties broken by guild XP.
- An enrolled player inactive for 15 minutes before the start is removed (the leader too).
- Real-time fight: the player picks a pair of cards, gets the boss card's counter-hit at once, the next pair appears.
  Bosses do not hit on their own; their pressure is a timed area effect.
- Cards on the field can be swapped any number of times for 10 gold.
- Each raid page has its own chat. A banner on other pages links to an active raid and announces its end.
- The guild chronicle records each finished raid; guild achievements count defeated bosses.

## Dragon raids

- Available from guild founding. Any rank may join; adepts and neophytes cannot start.
- 8 raids, each a named lair with one dragon:
  - Ancient (300 000 HP): Fire, Northern Mountains, Silver, Ancient Leviathan.
    Leviathan is not in the "Ancient dragons" collection but counts as ancient for raid rules.
  - Rare (500 000 HP): Black, Feathered, Underground, Sea.
- Dragon decks: random elements, regenerated before every fight, different for every participant.
  Ancient decks use "Ancient dragons" cards + the Leviathan card, power ~2700–3300;
  rare decks use "Urfin's favourites" cards, power ~3900–4800.
- The player fights with the battle deck only (no extra cards).
  Title "Dragon hunter" gives +10% card power (and health) in raids.
- Breath every 30 s: 10 000 (ancient) / 20 000 (rare) damage split evenly between living participants.
- Battle log shows the last 5 hits, participant deaths and breaths.
- Victory: each participant gains dragon-slayer points equal to damage dealt.
  The participant with the most points (including this raid) gets the dragon's card, then their points are halved.
  Points belong to the guild and reset when the player changes guild.
- Reward card: ancient — level 59, power 2680–3216; rare — level 69, power 3630–4356.
- Defeat: no points, no XP, no respawn; the dragon can be attacked again at once.
- After a victory the dragon respawns; the timer depends on the lair level.
  Players who did not take part can still attack it while it respawns for others.
  Changing guild keeps the remaining respawn time, then the new guild's timer applies.
- Lairs are upgraded separately with guild treasury gold/silver, up to level 20, never above the guild level.
  Currencies confirmed from the page icons (2026-11-13): silver prices differ for ancient / rare lairs;
  levels 5/10/15/20 cost the same gold for both kinds:

| Lair level | Cost (silver ancient / rare, or gold) | Respawn |
| --- | --- | --- |
| 1 | free | 6 d 20 h |
| 2–4 | 1M / 3M silver | 6 d 12 h · 6 d 4 h · 5 d 20 h |
| 5 | 2 000 gold | 4 d 20 h |
| 6–9 | 2M / 6M silver | 4 d 14 h · 4 d 8 h · 4 d 2 h · 3 d 20 h |
| 10 | 10 000 gold | 2 d 20 h |
| 11–14 | 4M / 12M silver | 2 d 16 h · 2 d 12 h · 2 d 8 h · 2 d 4 h |
| 15 | 50 000 gold | 1 d 12 h |
| 16–19 | 8M / 24M silver | 1 d 10 h · 1 d 8 h · 1 d 6 h · 1 d 4 h |
| 20 | 100 000 gold | 20 h |

- Achievement "Raid participation": 25 / 250 / 1000 dragons. Title "Dragon hunter": 1000 dragons.

## Witch raids

- Available from guild level 34; all members join; adepts and neophytes may start.
- Two witches at once with equal health per level; witch elements random per level.
- Levels 1–25 in strict order. No cooldown: win → next level at once; lose → retry the same level.
  The cycle lasts a week and restarts from level 1 on Monday.
- Each witch deck: 9 normal cards + 1 unique witch card (witch's element, "Witches" collection cover,
  fixed power per level, stronger than the rest). Decks are the same for all participants. Elements random per fight.
- Player health = battle deck + extra cards. "Battle gnomes" collection: +10% power and health.
- The player may switch between witches to choose the best hit.
- Healing up to 6 times: when a witch drops to 75% / 50% / 25% (each threshold once), the weaker witch heals
  up to the stronger one's health.
- Curse every 60 s: 10% of each participant's max health ("Peaceful gnomes": 5%). Log keeps 10 entries.
- Reward per defeated pair: one random participant gets access to the Treasure cave.
  They may dig now or keep raiding; the choice lasts until week end, refusing loses the treasure.
  Digging takes N hours for level N ("Peaceful gnomes" halves it; a "Mega-shovel" item makes it instant once),
  blocks witch fights for that player and blocks leaving or kicking them.
  Treasure (one of): 50×N gold, 100×N gold, 50 000×N silver, 200 000×N silver, or a "Witches" collection card:
  level 80 + N, base power bonus 1820 (table: level and power of the treasure card).
- Altar: the highest witch level beaten last week (X) sets this week's altar level.
  Potions last until 23:59:59: strong +X% health (X×2 gold or diamonds), mighty +X/2% (X×1000).
  They apply in war mass battles and tournaments. Full "Witches" collection: gold potion is 2 levels higher at the same price.

| Lvl | HP | Unique card | Treasure card (lvl, power) |
| --- | --- | --- | --- |
| 1 | 450 000 | 7500 | 81, 7100 |
| 2 | 510 000 | 8017 | 82, 7150 |
| 3 | 590 000 | 8570 | 83, 7200 |
| 4 | 670 000 | 9162 | 84, 7250 |
| 5 | 760 000 | 9795 | 85, 7800 |
| 6 | 870 000 | 10470 | 86, 7850 |
| 7 | 1 100 000 | 11192 | 87, 7900 |
| 8 | 1 400 000 | 11965 | 88, 7950 |
| 9 | 1 760 000 | 12790 | 89, 8000 |
| 10 | 2 200 000 | 13672 | 90, 8080 |
| 11 | 2 700 000 | 14617 | 91, 8170 |
| 12 | 3 200 000 | 15625 | 92, 8270 |
| 13 | 4 100 000 | 16702 | 93, 8380 |
| 14 | 4 900 000 | 17855 | 94, 8500 |
| 15 | 6 000 000 | 19087 | 95, 8650 |
| 16 | 7 300 000 | 20405 | 96, 8700 |
| 17 | 8 700 000 | 21812 | 97, 8760 |
| 18 | 10 500 000 | 23317 | 98, 8830 |
| 19 | 12 500 000 | 24927 | 99, 8910 |
| 20 | 15 000 000 | 26647 | 100, 9000 |
| 21 | 17 800 000 | 28485 | 101, 9100 |
| 22 | 21 000 000 | 30450 | 102, 9210 |
| 23 | 25 000 000 | 32552 | 103, 9330 |
| 24 | 30 000 000 | 34797 | 104, 9480 |
| 25 | 35 000 000 | 37197 | 105, 9680 |
