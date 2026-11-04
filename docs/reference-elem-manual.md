# elem.mobi: game logic notes

Our own summary, for mechanics only. Never take its visual style, art or copy.
Source: the in-game manual (`https://elem.mobi/forum/3/217669/`) and `/about/`,
checked on 2026-10-30. Some manual pages are old, so verify before relying on a number.

Numbers without a currency come from pages that mark the currency with an icon,
so read them carefully.

## Manual index

| Topic | Page |
| --- | --- |
| Duels | `/forum/3/217686/` |
| Campaigns | `/forum/3/218036/` |
| Arena / Tournament | `/forum/3/218665/`, `/forum/3/218666/` |
| Urfin invasion | `/forum/3/218997/` |
| War / Guild arena / Raids | `/forum/3/219893/`, `/forum/3/220602/`, `/forum/3/220651/` |
| Cards and battle deck | `/forum/3/221163/` |
| Battle mechanics | `/forum/3/223307/` |
| Witch raids | `/forum/3/224901/` |
| Collections | `/forum/3/222653/` |
| Experience and levels | `/forum/3/226592/` |
| Rating and leagues | `/forum/3/226703/` |
| Achievements / Titles | `/forum/3/227441/`, `/forum/3/227846/` |
| Diamond rewards | `/forum/3/227881/` |
| Daily tasks and marathon | `/forum/3/228564/` |
| Chest shop | `/forum/3/228581/` |
| Guardian dragon / Equipment | `/forum/3/268062/`, `/forum/3/294767/` |
| Guild / Guild card / Players | `/forum/3/229391/`, `/forum/3/229392/`, `/forum/3/229393/` |
| Gold / Silver / Diamonds | `/forum/3/230448/`, `/forum/3/230449/`, `/forum/3/230450/` |
| Shop / Promotions | `/forum/3/230814/`, `/forum/3/231069/` |
| Tips and facts / FAQ | `/forum/3/231916/`, `/forum/3/231126/` |

Read closely so far: campaigns, shop, gold, silver, battle mechanics, the start of
experience and diamonds. The rest is indexed but not summarized yet.

## Shop

- Sections: magic cards, profile looks, boosts, and starter bundles early in the game.
- Three offers, each with a guaranteed quality and a chance of better:

| Price | Guaranteed | Better chance grows per miss |
| --- | --- | --- |
| 500 silver | uncommon | rare +3.5%, epic +0.25% |
| 50 gold | epic | legendary +3.5%, mythic +0.25% |
| 150 gold | legendary | mythic +3.5% |

- A hit halves that chance, then rounds up to a whole number.
- The card itself is random among those sold at that price.
- Gold offers can also be paid in diamonds at double the price. A shortfall of silver
  or diamonds can be topped up with gold at 100 silver or 1 diamond per gold.
- Starter bundles are one-time and open in order: 4 uncommon collection cards for 20,
  3 random epics for 60, 2 random legendaries for 120.
- Boosts cost 10, last 1 hour and give +100% experience or silver; one of each at a time.
- Buying cards counts for a daily task until the third epic league.

## Quality by card level

Quality follows level, so any card can reach mythic: common below 5, uncommon below 10,
rare below 20, epic below 35, legendary below 60, mythic above 60. A few cards are born
at a fixed high quality.

## Battle

- Three of your cards face three enemy cards; a card only fights the one opposite it.
- Striking also takes the return hit from the card opposite.
- Water beats fire, fire beats air, air beats earth, earth beats water: 150% one way,
  50% the other, 100% otherwise.
- The sum of deck power is your health.
- After 10 duels in a row there is a 2 hour break, which gold can skip.

## Campaigns

- Ten locations in order, each opened by completing its trials, then a boss.
- Finishing a campaign means all its trials plus the first boss win.
- Most trials count all progress since the start of the game, so they can already be
  done when the campaign opens. Trials worded with "more" count only from the previous
  campaign's end.
- Bosses are blind duels. Extra deck cards do not take part.
- First boss win gives a larger gold and silver reward plus a card; later wins after the
  boss respawns give only a card. Only three locations can be refought at a time.
- Rewards per campaign (trials | first boss win):

| # | Gold | Silver |
| --- | --- | --- |
| 1 | 14 \| 10 | 400 \| 2,000 |
| 2 | 10 \| 20 | 1,000 \| 5,000 |
| 3 | 12 \| 30 | 1,200 \| 10,000 |
| 4 | 20 \| 40 | 2,000 \| 25,000 |
| 5 | 25 \| 50 | 2,500 \| 50,000 |
| 6 | 42 \| 60 | 4,200 \| 100,000 |
| 7 | 49 \| 70 | 4,900 \| 250,000 |
| 8 | 56 \| 80 | 5,600 \| 500,000 |
| 9 | 63 \| 90 | 6,300 \| 1,000,000 |
| 10 | 70 \| 100 | 7,000 \| 2,000,000 |

## Economy

- **Duel gold:** wins pay gold up to a daily limit equal to the player's level.
- **Duel silver:** a win pays the league's base (100 at the start, 2,500 at the top), a
  loss pays half, then bonuses apply.
- **Level up:** gold equal to the new level.
- **Daily login:** gold of level / 2 (rounded down), plus 2 diamonds.
- **Daily tasks:** 6 tasks today double tomorrow's rewards, 7 or more triple them.
- **Diamond rewards:** gold per circle 350, 500, 750, 900; silver per circle 3.5M, 5M, 7.5M,
  9M, 10M.
- **Experience:** comes from damage dealt, then percentage bonuses from the base value.
