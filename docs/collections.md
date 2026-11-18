# Collections v1

Cardastika has 50 established collections of 3 to 15 cards and the new one-card
collection «Легенди Twitch», which is waiting for more members: 51 collections and
214 species in total (16 of them outside any collection). The catalog is generated from `tools/card-catalog/` into
`server/src/collections/catalogData.generated.ts` and readable in `docs/card-catalog-v2.md`;
edit the sources there and rerun `node tools/card-catalog/build-catalog.js <repo path>`.
Each collection keeps its acquisition source as a display prefix and a short description in
`tools/card-catalog/collection-copy.js`. The generator writes Ukrainian copy to the server
catalog and translations to `client/src/locales/collectionTranslations.generated.ts`; the
collection API returns the prefix and description with each summary.
One card may belong to several collections: membership lives in `collection_cards`, and
`cards.collection_id` keeps only the first one. The 11 starter cards are ordinary
catalog species, some of them inside collections (see `docs/game-rules.md`). A card shows artwork only once it has a line in
`client/public/card-art/card-art-map.txt`.

Each shop banner sells its own list of cards at each rarity (`shopPools` in the generated
data, shown under "Детальніше"). A shop card's `minRarity` is the lowest rarity any banner
sells it at. Bonuses for mechanics that do not exist yet use the `none` type. Bonus labels
describe the effect; a separate status says whether it is active, partly active, pending, or
unassigned.

Collection progress comes only from `player_card_discoveries`, never from the
current inventory. Acquiring a species inserts one idempotent discovery row.
When all members are discovered, one `player_collection_completions` row makes
the bonus permanent; absorbing or otherwise removing instances cannot revoke
progress or completion.
Each new completion also grants 1 Battle Pass diamond and 1,000 silver exactly
once. Historical completions are backfilled to the current Battle Pass season,
because their original season was not recorded.

Collection bonuses are permanent, additive modifiers aggregated in `game-core`,
but each bonus also declares its active context (`duel`, `arena`, `campaign`,
`guild_raid`, `absorption`, or `altar`). Mode-specific bonuses such as tournament,
guild war, equipment, and winter effects are applied by the system that owns
those rules and checks the completed collection code. `all_battles` is reserved
for a bonus that intentionally applies to every battle mode; a battle bonus
never leaks into card progression or guild utility systems. They never mutate
persisted instance `finalPower`. The authenticated `PlayerSummary` exposes every
completed collection bonus in `collectionBonuses`, and each relevant system
recalculates only the permanent bonuses applicable to its own context.

The permanent Shop resolves pity rarity first, filters canonical cards by
`minRarity <= resolved rarity`, then selects a uniform integer level from the
single Shop range table: Uncommon 5–9, Rare 10–19, Epic 20–34, Legendary 35–59,
and Mythic 60–75. Global Mythic progression remains 60–180.

The collection UI separates canonical species from player instances. An
undiscovered species may show name, element, minimum rarity, and collection,
but never fabricated level, power, or bonus power. Owned instance controls stay
on the existing instance Card Detail screen.
The catalog explicitly marks each bonus `active`, `partial`, `pending`, or
`unassigned`; completing a collection does not label a future mechanic as active.

## Bonuses keyed by collection code

Some bonuses keep the `none` type in the `collections` table and are applied by the
system they belong to, which checks the completed collection by code. This avoids
widening the `buff_type` constraint:

- Tournament: the four element collections, «Чотири владики», «Шулікові велетні»
  (`TOURNAMENT_COLLECTION_EFFECTS` in `game-core/src/tournamentPvp.ts`).
- Equipment: «Вибір Полум'я / Течії / Каменю / Вітру» make things of that element 25%
  stronger before the equipment sets apply (`EQUIPMENT_COLLECTION_ELEMENT_BONUSES`,
  `calculateEquipmentSummary` in `game-core/src/equipment.ts`). Battles, the own
  profile, the equipment screen and public profiles pass the completed collections in.
- Guild XP: «Весняний цвіт» and «Старі вояки» add 10% each to every guild XP
  contribution; the daily cap is unchanged (`applyGuildXpCollectionBonus`).
- Witch raid: «Гноми на відпочинку» halve the curse to 5% of max HP
  (`server/src/guild/guildRaidService.ts`); faster treasure digging waits for the Caves.
  «Гноми на війні» also raise the player's raid HP by 10% next to their `battle_damage_pct`.
- Shop: «Шулікова зграя» makes the first card purchase of each UTC day free, on any of the
  card offers; unused days do not accumulate and pity advances as usual
  (`players.free_shop_purchase_on`, `server/src/shop/shopService.ts`).
- Treasury: «Шулікові ватажки» — the game adds 20% on top of the player's own gold or
  silver donation; «Рідкісні змії» raise the daily gold contribution limit from 5 to 10
  (`server/src/guild/treasuryService.ts`); card elements are not raised.
- Altar: «Чотири чаклунки» (`altar_gold_levels`) is looked up by bonus type in
  `server/src/guild/altarService.ts`.
- Турнір і війна гільдій: чотири колекції сузір'їв підсилюють карти своєї стихії
  на 5%, 7,5% або 10%; усі чотири разом дають 10% картам усіх стихій
  (`getZodiacCollectionElementPct`). «Чотири владики» додають 5% бойового здоров'я.
- Війна гільдій: «Шулікові улюбленці» дають повторну спробу після програної дуелі
  за ключ; «Скажена четвірка» вмикає один подвоєний спільний удар трьома картами;
  «Старий заклик» дає виклик Давньої істоти, а Кристал магії відкриває другий.
  Правила — у `docs/guild-war.md`.
- Зимова подія: під час налаштованого в UTC зимового періоду «Зимова рать»
  додає +20% бойової сили семи картам колекції й святкову позначку в профілі,
  чаті та гільдійському форумі. Знижка на подарунки поки часткова: у Cardastika
  немає магазину подарунків між гравцями.
- Спорядження: завершена колекція на 33% підсилює відповідний одягнений артефакт;
  «Культ мотанки» подвоює його ефект. Два бонуси Алебарди додаються. У грі вже
  є всі шість типів артефактів.
- Удари: чотири колекції цехів додають +0,1 до слабкого, критичного, звичайного
  удару в атаці або звичайного удару у відповідь. У Cardastika кожна колекція
  має один рівень завершення, тому це одноразовий бонус.

Колекції сузір'їв залишаються `partial`: бонус сили карт працює, але додаткова
нагорода «три артефакти» з довідника не має визначеного сенсу за наявних шести
слотів спорядження. Зимова колекція лишається `partial`, поки немає магазину
подарунків. «Гноми на відпочинку» також часткові: скарби в Печерах ще не
реалізовані. Бонуси полум'я й майстерності дракона працюють, як і ефекти
«Механістів» та «Шукачів скарбів» у Навалі. Правила для кожної колекції наведені в
`docs/reference-elem-collections.md`. Підписи змінюються міграціями, а джерело
каталогу й статусів — `tools/card-catalog/build-catalog.js`.

Two completion sources exist: equipment, guild XP and the public profile read
`player_collection_completions`, while the shop, treasury, witch raid and altar use
`hasCompletedCollection`, which derives completion from discoveries. They agree while the
catalog is stable; after a catalog change that adds cards to a completed collection they can
differ, so route new checks through one of them consistently.
