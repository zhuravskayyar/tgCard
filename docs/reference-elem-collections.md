# elem.mobi: collection bonus rules

Our own summary of the reference manual page «Мануал: коллекции»
(`https://elem.mobi/forum/3/222653/`), checked again on 2026-11-17.
Mechanics only: names, art and copy in Cardastika stay our own. Our codes are in brackets.

## General

- A completed collection gives a permanent (sometimes one-time) bonus.
- Cards count once they have been in the weak cards or the battle deck, even if they are gone later.
- One card may be in several collections; some cards are in none.
- Completing a collection also pays 1 diamond and 1,000 silver once; achievements
  «Знаток» and «Собиратель» are awarded at 10 and 15 collections.

## Bonuses and their details

| Reference | Ours | Bonus | Details |
| --- | --- | --- | --- |
| Хозяева морей / Сила орды / Небесные герои / Обитатели леса | `sea_masters`, `horde`, `sky_heroes`, `forest_dwellers` | +5% to one element's cards in the tournament | Card power only, not player HP |
| Элементали | `elementals` | +10% duel silver | Only silver paid for taking part in duels |
| Боевые элементали | `highelem` | −30 min duel break | Break becomes 1 h 30 min |
| 8 марта / 23 февраля | `spring_bloom`, `old_soldiers` | +10% guild XP each | Player gets N, the guild gets 1.1×N; the two stack |
| Древние драконы | `dragons` | +5 daily duel gold | |
| Редкие драконы | `dragons2` | +10 daily duel gold | Also raises the daily treasury contribution from 5 to 10 (not in the label) |
| Мифические создания | `mythic` | +10% card upgrade speed | Absorbed elements give 10% more progress |
| Высшие маги | `wizards` | +5% player HP in the tournament and guild wars | Both mass war battles and key duels |
| Мутанты Урфина | `umutants` | Faster duel gold | A duel win gives about 10% of the daily limit |
| Гиганты Урфина | `ugiants` | Tournament buff +5% | Buff 15% → 20% |
| Фавориты Урфина | `ufavorites` | Extra key capture attempt in guild wars | Not a 4th key: a retry if one of the 3 attempts fails |
| Солдаты Урфина | `usoldiers` | Daily free card purchase | The first card purchase each day is free; any of the four card purchases may be chosen; unused free purchases do not accumulate |
| Генералы Урфина | `ugenerals` | +20% to your treasury contribution | The game adds 20% extra gold and silver on top of the player's own contribution; automatic contributions (war keys, promotions) are not raised |
| Механисты | `mechanists` | +5% to all cards against Urfin's bosses | Both card power and player HP |
| Колдуньи | `sorceresses` | Gold altar buff 2 levels higher | Gold purchases only; the price does not change |
| Зимнее усиление | `winter_reinforcement` | Winter-only perks | Festive profile, gifts half price, festive chat style, winter card +20% |
| Мирные гномы | `dwarves_peace` | Witch curse damage ×0.5; treasure digging in the Caves ×0.5 time | |
| Боевые гномы | `dwarves_war` | +10% battle deck power against the witches | The witch raid page adds: card power and player HP +10% |
| Яростные берсерки | `berserks` | «Берсерк» skill in guild war battles | All three cards must be ready; once per battle; counter-hit unchanged |
| Охотники за сокровищами | `treasure_hunters` | Double daily diamond quota in the Invasion | |
| Укротительницы драконов | `dragon_whisperers` | Double «Dragon flame» damage | |
| Любители драконов / Основы магии драконов / Исцеляющая магия драконов | `dragon_fans`, `magic_1`, `magic_heal` | Dragon mastery +10 from each collection | The bonuses stack; see https://elem.mobi/about/pet_dragon_more/ |
| Древний Орден | `ancient_order` | Summon an Ancient creature in guild wars | Replaces three cards, crits any card, takes half damage back; twice with a Magic crystal |
| Алмазное братство | `diamond_brotherhood` | Cheaper 4th diamond-reward circle, adds a 5th | |

## Cardastika implementation notes

- The four Zodiac collections apply +5% to each completed collection's element
  in tournaments and guild wars. With two, three, or four collections the bonus
  becomes +7.5%, +10%, or +10%; completing all four applies +10% to every
  element. The additional three-artifact reward remains unimplemented because
  the game already has six artifact slots and the reward's behavior is unclear.
- The artifact collections strengthen the matching equipped artifact by 33%:
  `sacred_shores` (Spellcaster's Sting), `great_path` (Oath Ward),
  `thirtieth` (Echo Glass), `western_wastes` (Unlucky Motanka),
  `gorgeous_cats` (Second Breath Charm), and both `breach_wedge` and
  `mirror_fragments` (Halberd). `voodoo_cult` doubles the Motanka's effect.
- The four workshop collections add +0.1 to their matching strike multipliers:
  critical attack and counter, weak attack and counter, normal attack, and normal
  counter. This is a one-time completion bonus because Cardastika has no
  collection-level progression.
- The winter card bonus, festive profile mark, chat styling, and forum styling
  work during the configured winter window. Gift discounts remain unavailable
  because there is no player-to-player gift shop.
