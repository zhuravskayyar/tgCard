# Guild Wars

Rules reference: [official Guild Wars guide](https://elem.mobi/about/guilds_war/).

## Weekly cycle

- Wars unlock at guild level 35.
- The week uses UTC boundaries: Monday pairs and roster, Tuesday and Thursday key duels, Wednesday and Friday mass battles, Saturday results, Sunday rest.
- Pairings are created once per week from guild war rating. If the number of level-35+ guilds is odd, the highest-rated level-34 guild joins the field.
- Guild names, levels, ratings, member names, levels, deck power, duel ratings, and roles are saved as weekly snapshots. Later role changes do not rewrite that snapshot. The roster is sorted by battle deck power with the guild card included. Fighters use their current deck when joining a fight.
- A level-34 guild selected to complete the pairing field can see and play its match.
- A rostered member cannot leave, be kicked, or dissolve a one-member guild until the Sunday rest phase.

The long-running server advances the cycle at startup and every minute. Vercel dispatches the protected war tick Monday and Saturday at 00:00 UTC using `CRON_SECRET`. The war endpoint also catches up when viewed, and the first membership change of the week prepares the roster in its transaction before making the change. If the server cannot run at the start of the week, it snapshots the roster at the first successful initialization after recovery.

## Key duels

Tuesday and Thursday each have a fresh set of keys. A fighter has three attempts and an individual defender guards three keys. The same player cannot challenge the same defender again that day. One free key is available to each side per vacant roster slot of its opponent. An active duel reserves a defender key and releases it if the challenger loses or is idle for 15 minutes. The challenger earns XP equal to damage dealt on a win and half on a loss, with active XP boosts applied.

`ufavorites` grants an additional attempt after a failed attempt. The daily maximum remains three keys. `wizards` adds 5% HP in key duels and mass battles.

## Mass battles

Four independent battles run on Wednesday and four on Friday. Each costs a key earned the previous day. Unspent keys expire after the day. Cardastika schedules UTC registration at 00:00, 06:00, 12:00 and 18:00, then runs 1 hour of registration, 2 hours of location battles, and 3 hours in the Wasteland. During a battle a late participant pays 10 gold in addition to a key.

Each battle offers two locations with +5% power to two elements each. Players fight inside their chosen location first. Living players enter the Wasteland with their remaining HP, location bonus, card state, and used skill counters. When the Wasteland closes, remaining total HP determines the winner if both sides still have survivors. Damage breaks a remaining tie. A battle without any fighters ends in a draw. Individual XP is based on all damage dealt in the battle.

Completed Zodiac collections, strike bonuses and equipped artifacts use the same battle rules as the other supported modes. `berserks` doubles the combined attack of all three ready cards once. The opponent's counter stays the same. `ancient_order` replaces three ready cards with an Ancient strike using their combined power, always crits, and halves the return damage. A Magic Crystal pays for a second Ancient strike in the same battle.

## Results and remaining rules

Saturday results compare team wins first and total damage second. Each win adds one point to the guild's war rating and the overall winner gains one additional point. The winner's treasury receives 1,000 gold. Keys add 5 gold each to the winning guild's treasury and 2 each to the other guild, credited to the individual player's contribution statistics. Each rostered player receives a random-element magic source at the opponent guild card's level for a win or ten levels below for a loss, with a minimum of level 1. Sources require the opponent to have a guild card. A completely unplayed match grants no war rewards. The war screen shows the last 12 results.

Cardastika has guild permissions but no reference-equivalent Combat Mage rank or loyalty statistic. All members present at the weekly snapshot are eligible. The official reference does not define team battle hours or the numeric personal reward formula, so the timetable, damage-to-XP rule, simultaneous elimination treatment, and end-of-window tiebreaker are Cardastika rules. Seasonal medals and seasonal rating resets are still pending. Team battle diamond rewards are pending an economy rule.

## Data and code

- Pure schedule and pairing rules: `game-core/src/guildWar.ts`.
- Weekly snapshots and war data in `server/src/guild/guildWarService.ts`, combat and settlement in `server/src/guild/guildWarCombat.ts`.
- API `GET /api/guilds/:guildId/war` and `POST /api/guilds/:guildId/war/action`.
- Scheduler `GET /api/internal/guild-wars/tick`.
- Schema in migrations `103_guild_wars.sql` and `104_guild_war_combat.sql`.
- Screens `client/src/screens/guild/GuildWarScreen.tsx` and `GuildWarCombat.tsx`.
