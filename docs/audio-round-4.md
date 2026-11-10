# Четвертий підбір звуків Cardastika — аніме-звук, CC0

10.11.2026. Статус: **20 звуків підключено в гру локально, не запушено.**

Напрям від користувача: звук у дусі бойових аніме (Studio Pierrot, Toei) — гострий свист-промінь, удар із дзвоном, іскри «кіра». Оригінальні звуки студій захищені авторським правом, тому взято CC0-записи з Freesound схожого характеру. На [стенді](audio-review/index.html) 61 варіант (по 2–5 на подію) — четвертий підбір відкривається за замовчуванням.

## Підготовка

`node tools/audio-pick/round4.mjs <тека з HQ-прев’ю Freesound>` — обрізка від першого удару, зріз нижче 100 Гц (динамік телефону), плавні краї, найгучніші 50 мс доведено до цілі групи (кнопки −26, карти −23, паки й нагороди −21, політ −21, удари −20/−17/−14, шари стихій −23, результат −20 dBFS RMS), лімітер −1 dBFS. MP3 mono 44.1 kHz / 128 kbps. Скрипт пише `audio-review/audio/round-4/`, `manifest-round-4.json` (SHA-256 оригіналу й результату) і блок `round4-data` у стенді. Різниця з планом третього підбору вирівняна через `gain` у `client/src/audio/cues.ts`.

## Вибір у грі

Користувач доручив вибір Claude («обери сам»). Слухове оцінювання не проводилось — вибір за огинаючою: пік збігається з кадром (`battle-fly` грає на старті польоту 220–320 мс; удари й стихії — у мить зіткнення), довжина під прискорений удар ~1,3 с, без суб-басу.

| Подія | Варіант | Оригінал — автор | Довжина | Чому |
| --- | --- | --- | --- | --- |
| `battle-fly` | B | [hi speed electronic whoosh 1](https://freesound.org/people/martian/sounds/19307/) — martian | 0.42 с | пік на 0,18 с — збігається з польотом 220–320 мс |
| `hit-weak` | A | [Nice anime sword hit](https://freesound.org/people/xkeril/sounds/706204/) — xkeril | 0.7 с | яскравий аніме-удар, пік одразу |
| `hit-normal` | A | [Anime Sound Effect - Piercing impact](https://freesound.org/people/Breviceps/sounds/464839/) — Breviceps | 0.761 с | класичний аніме-прокол, щільний з перших 60 мс |
| `hit-strong` | A | [Low_Mid_End_Void_Energy_Blast_Punch_02](https://freesound.org/people/The_Elementus/sounds/873746/) — The_Elementus | 0.745 с | важкий енерго-панч, середні частоти чути на телефоні |
| `element-fire` | A | [Fire Magic](https://freesound.org/people/qubodup/sounds/442872/) — qubodup | 0.8 с | полум’я з першої миті |
| `element-water` | B | [BubbleBeam](https://freesound.org/people/deleted_user_4128231/sounds/406084/) — deleted_user_4128231 | 0.754 с | короткий водяний сплеск одразу при ударі |
| `element-air` | A | [Swish Swipe Short](https://freesound.org/people/Qvantor/sounds/877976/) — Qvantor | 0.448 с | різкий порив, пік 0,1 с |
| `element-earth` | A | [Rock Smash](https://freesound.org/people/NeoSpica/sounds/512243/) — NeoSpica | 0.632 с | тріск каменю (тиша на початку зрізана) |
| `card-flip` | B | [Card](https://freesound.org/people/CaptainYulef/sounds/638697/) — CaptainYulef | 0.4 с | ляскіт карти без запізнення |
| `nav-page` | A | [fliping a page in a book](https://freesound.org/people/1skyland/sounds/543168/) — 1skyland | 0.499 с | коротка сторінка |
| `ui-tap` | A | [UI Click Wooden](https://freesound.org/people/Qvantor/sounds/878238/) — Qvantor | 0.185 с | сухий дерев’яний клік |
| `ui-back` | B | [menu_click](https://freesound.org/people/jackosnb/sounds/736912/) — jackosnb | 0.146 с | короткий інший клік |
| `pack-shake` | A | [Card Shuffle](https://freesound.org/people/CaptainYulef/sounds/638698/) — CaptainYulef | 1 с | шелест карт |
| `pack-tear` | A | [Fast Paper Rip](https://freesound.org/people/sgrowe/sounds/342541/) — sgrowe | 0.699 с | різкий розрив |
| `reveal-common` | B | [cartoon_wink_magic_sparkle](https://freesound.org/people/MLaudio/sounds/511485/) — MLaudio | 1 с | аніме «кіра»-іскра |
| `reveal-epic` | A | [Spell Cast / Buff / High Tone](https://freesound.org/people/SypherZent/sounds/420676/) — SypherZent | 1.165 с | яскравий магічний підйом |
| `coins-reward` | B | [Coin Splash](https://freesound.org/people/KaysonArgyle/sounds/547603/) — KaysonArgyle | 0.303 с | короткий дзенькіт |
| `forge-strike` | A | [Anvil Hit 2](https://freesound.org/people/michorvath/sounds/270588/) — michorvath | 0.446 с | чистий удар по ковадлу |
| `battle-victory` | A | [Fanfare 2 - Rpg](https://freesound.org/people/colorsCrimsonTears/sounds/580310/) — colorsCrimsonTears | 1.757 с | коротка фанфара 1,8 с |
| `battle-defeat` | A | [failure 2](https://freesound.org/people/Leszek_Szary/sounds/171672/) — Leszek_Szary | 1.224 с | спадний мотив 1,2 с |

Кандидати `seal-open-*` (дзвін магічного кола) у гру не підключено: окремої події «печать розкривається на замаху» в коді поки немає.

## Ліцензії

Усі 20 звуків — **CC0 1.0** (перевірено на сторінці кожного звуку 10.11.2026): комерційне використання без титрів. Повна таблиця з посиланнями — [licenses/round-4/freesound-cc0.md](audio-review/licenses/round-4/freesound-cc0.md).

Набір Helton Yan «Old-School Shonen SFX» (CC BY 4.0, потрібні титри) погоджено як можливе доповнення, але сторінка itch.io за перевіркою Cloudflare; не завантажено.

## Прокачка карт (додано 10.11.2026)

| Подія | Файл (CC0) | Коли грає |
| --- | --- | --- |
| `card-absorb` | [Whoosh Magic Sparkle](https://freesound.org/people/Qvantor/sounds/877981/) — Qvantor, 1,3 с (варіант B, вибір користувача; A — Deep Tone SypherZent, C–E — на стенді) | Слабка карта починає розчинятися (`playCardDestructionFx`) |
| `power-tick` | [ShiningRinging](https://freesound.org/people/NoisyRedFox/sounds/759840/) — NoisyRedFox, перший дзвін 0,14 с | Кожна цифра «+N» долітає до сили карти |
| `card-level-up` | [victory chime](https://freesound.org/people/1bob/sounds/717771/) — 1bob, 0,81 с | Остання цифра долетіла, сила дорахувалась; також без польоту цифр (reduced motion або без приросту сили) |
| `reveal-epic` | повторне використання | Зміна рідкості карти |

Звуки завантажуються під час відкриття Card Detail. Анімацію поглинання прискорено приблизно на третину: розчинення 2,3 → 1,5 с, тремтіння 1,9 → 1,25 с, запасне згасання 1,4 → 0,95 с, політ цифр 0,62–0,94 → 0,42–0,64 с, лічильник 320 → 240 мс, збільшення при зміні рідкості 1,5 → 1,1 с.

## Зарахування нагород (додано 10.11.2026)

`reward-claim` — [GLEAM-GLOW-SFX-CHIME](https://freesound.org/people/newagesoup/sounds/351408/) — newagesoup, CC0, фрагмент із 2,0 с, 1,2 с (варіант A; B — чарівні іскри qubodup, C — початок фанфари). Грає після підтвердження сервера: щоденне завдання, віха battle pass, випробування пригоди, збереження профілю, лист із нагородою. Щоденний вхід лишає `coins-reward`; нагорода боса кампанії звучить фанфарою перемоги. Завантажується разом із базовими UI-звуками після першого дотику.

## Відкриття пакунка (додано 10.11.2026)

Вибір користувача — варіант E у всіх трьох подіях:

| Подія | Файл (CC0) |
| --- | --- |
| `pack-tear` | [SFX Magic](https://freesound.org/people/renatalmar/sounds/264981/) — renatalmar, 1,0 с |
| `reveal-common` | [Item Pickup Chime](https://freesound.org/people/Irolan/sounds/735168/) — Irolan, 1,0 с |
| `reveal-epic` | [Cliche Magic Spell Sound](https://freesound.org/people/qubodup/sounds/817466/) — qubodup, фрагмент з 0,55 с, 1,4 с |

Ті самі звуки грають і в 3D-відкритті, і в 2D-відкритті пачки. 3D-анімацію прискорено в 1,5 раза (`BOOSTER_TEMPO` у `client/src/booster/boosterMotion.ts`): ≈2,3 с замість 3,5 с; перехід до екрана нагороди 280 → 200 мс.

## Записи замість синтетики та звуки стихій у дуелі (додано 10.11.2026)

Користувач попросив прибрати 8-бітні та дешеві синтетичні звуки. За тегами й описами авторів на Freesound такими виявились: перемога (чіптюн із MilkyTracker), поразка (синтетичний game over), кінець прокачки («16-bit victory/coin»), політ карти («cartoon electronic whoosh»), удар води («sci-fi bubble ray gun»), клік кнопки (синтез у Chisper). Вибір нижче зроблено за описами авторів (Claude не прослуховує); фінальна оцінка — на слух користувача.

| Подія | Файл (CC0) |
| --- | --- |
| `battle-victory` | [Inception Horn Victory](https://freesound.org/people/Kubatko/sounds/336725/) — Kubatko, 2,4 с |
| `battle-defeat` | [Drop (dramatic strings)](https://freesound.org/people/burlyegg/sounds/391095/) — burlyegg, фрагмент з 3,0 с, 2,6 с |
| `card-level-up` | [Glockenspiel_46_f4_04](https://freesound.org/people/cabled_mess/sounds/348924/) — cabled_mess, запис глокеншпіля, 1,2 с |
| `ui-tap` | [Woodblock-soft](https://freesound.org/people/hollandm/sounds/692828/) — hollandm, запис, 0,18 с |
| `fly-fire` | [Basic Fire Whoosh 2](https://freesound.org/people/LookIMadeAThing/sounds/260555/) — LookIMadeAThing |
| `fly-water` | [Whoosh - Plastic water pipe](https://freesound.org/people/Sadiquecat/sounds/855838/) — Sadiquecat |
| `fly-air` | [Whoosh](https://freesound.org/people/qubodup/sounds/60013/) — qubodup (змах бамбуком) |
| `fly-earth` | [FX - Swoosh - Low Pitch](https://freesound.org/people/bolkmar/sounds/475135/) — bolkmar |
| `element-fire` | [Fire Burst Flash](https://freesound.org/people/Za-Games/sounds/539972/) — Za-Games |
| `element-water` | [Stick Throw Into Water](https://freesound.org/people/jakubp.jp/sounds/554595/) — jakubp.jp (запис Zoom XYH-5) |
| `element-air` | [wind_gust_short](https://freesound.org/people/sqeeeek/sounds/381853/) — sqeeeek (запис вітру) |
| `element-earth` | [Concrete SMASH 2](https://freesound.org/people/magnuswaker/sounds/522099/) — magnuswaker |

Дуель: `BattleAttackAnimation` грає `flySoundCue(element)` на старті польоту, а в момент удару — `elementSoundCue(element)` як головний звук (ціль −18 dBFS, gain 1) і шар сили удару `hit-*` тихіше (gain 0,5–0,55). `battle-fly` лишився в наборі, але бій його більше не викликає.
