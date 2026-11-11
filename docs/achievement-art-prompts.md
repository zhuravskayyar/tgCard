# Досягнення: аудит артів і промпти

**Статус:** аудит референсу завершено; 27 майстер-артів згенеровано, скачано й збережено як прозорі lossless WebP у `client/public/assets/achievements/`. Усі файли перевірені як 1254×1254 RGBA з прозорими кутами; маску боса спрощено після перевірки читабельності на 50 px.

Каталог із рівнями підключено до екрана рекордів; палітра кожного рівня рендериться WebGL-шейдером. API віддає наявні лічильники дуелей, арени, турнірів Майстрів, внесків і досвіду гільдії, перемог над відьмами, сили колоди, колекцій і кузні. Статистика Урфіна, драконів і воєн гільдій, крамниць скринь, марафону та подарунків поки повертає `null`. Лічильник кузні накопичує події від підключення `EQUIPMENT_FORGED`; старі створення окремо відновити неможливо. Геометричні шари для рівнів із різною кількістю предметів залишаються наступним етапом.

Перемоги над відьмами записуються окремою незмінною подією й не зникають після тижневого скидання рейду. Міграція переносить перемоги, які ще є в поточному тижні; давніші видалені бої відновити неможливо. Для рейтингових нагород і сили колоди сервер запам’ятовує найкраще значення при завантаженні рекордів, тож уже показана здобута нагорода не відкочується; попередні піки, яких система не спостерігала, не відновлюються.

## Аудит референсу

Джерело: [каталог досягнень elem.mobi](https://elem.mobi/records/achievements/) і сторінки кожної з 27 категорій. У каталозі 69 нагородних варіантів: 20 сімейств по три рівні, п’ять одиночних і два дворівневих сімейства. Значки показані приблизно по 50×50 px.

Оригінальна подача — маленький кольоровий предметний значок на темному тлі. У більшості сімейств зберігається головний силует, а рівні відрізняються кількістю деталей, променями, лаврами, каменями або металевим обрамленням. Для нашої версії беремо лише тему символу й зрозумілу прогресію; форми, палітру та піксельну композицію перемальовуємо самостійно.

## План повторного використання

Не потрібно малювати 69 повністю окремих значків. Для кожного сімейства зберігаємо один майстер-арт основного символу, а рівні збираємо з трьох частин:

1. **Майстер-арт:** незмінний силует на прозорому тлі, монохромна різьба в нашому стилі.
2. **Палітра рівня:** шейдер задає відтінок матеріалу, світло/тінь і колір окремої підкладки. Палітра — це параметр значка, а не нове зображення.
3. **Орнамент рівня:** окремий прозорий шар лише там, де справді міняється геометрія: додається предмет, камінь, лавр, промінь чи обідок.

У референсах найкраще підходять для шейдерного варіанту сімейства з незмінною центральною формою: меч арени, маски, елементальна куля, дракон, ключі, профіль на щиті, метелик, скриня та знаряддя кузні. Їх варто спочатку звірити як один майстер-арт із трьома палітрами. Кількість предметів не можна отримати зміною кольору: для конюшини, монет, зірок, карт, подарунків і сердець потрібні додаткові копії або окремі шари.

| Сімейство | Повторно використати | Що відрізняє рівень |
| --- | --- | --- |
| Перемоги в дуелях | Один кулак як майстер-арт | Палітра; медаль, аура чи лавр — лише окремими шарами за потреби |
| Топ-100 дуелянтів | Один унікальний арт | Один рівень |
| Перше місце в дуелях | Один унікальний арт | Один рівень |
| Перемоги на арені | Один меч | Переважно палітра; якщо в референсі різниться обрамлення — шар обідка/променів |
| Переможені маги на арені | Одна маска | Палітра; гребінь або промені — окремий шар |
| Топ-100 арени | Один унікальний арт | Один рівень |
| Перше місце в рейтингу арени | Один унікальний арт | Один рівень |
| Чемпіон турніру майстрів | Один унікальний арт | Один рівень |
| Шкода босам за одне нашестя | Одна маска-трофей | Палітра; стрічки/промені — окремі шари |
| Суперудари в нашесті | Один листок конюшини | Шейдер плюс 1/2/3 копії мотиву |
| Отримані карти за шкоду босу | Один щит із картою | Шейдер плюс додаткові зірки як шари |
| Перше місце за шкодою | Одна корона | Палітра; камені та лавр — шари, якщо геометрія рівнів відрізняється |
| Золото в казну | Одна монета й один гаманець | Шейдер плюс додаткові монети/мішечок |
| Пожертви елементів у карту гільдії | Одна елементальна куля | Палітра; орбіти — окремі шари |
| Дракони в рейдах | Одна голова дракона | Палітра; крила чи лавр — шар тільки якщо форма справді змінюється |
| Ключі у війнах гільдій | Одна пара перехрещених ключів | Палітра; третій ключ — окремий шар |
| Участь у війнах гільдій | Один шолом | Палітра плюс другий шолом/зброя як шари |
| Досвід у гільдії | Один щит із профілем | Палітра; обідок і лавр — шари |
| Перемоги над колдуніями | Одна ліхтарня | Палітра; полум’я/терновий орнамент — шари |
| Сила бойової колоди | Одна карта | Шейдер плюс копії карт для віяла |
| Зібрані колекції | Один метелик | Палітра; додаткові крила — шар, якщо рівні їх справді додають |
| Завершені крамниці скринь | Одна скриня | Переважно палітра; монети, замок чи металеві накладки — шари за потреби |
| Перемоги в марафоні | Один крилатий сандаль | Палітра; додаткове крило/лавровий вузол — шар |
| Надіслані подарунки | Одна коробка | Шейдер плюс копії коробки/стрічки |
| Отримані подарунки | Одне серце | Шейдер плюс копії серця |
| Створені речі в кузні | Один молот і ковадло | Палітра; іскри — маленький спільний шар |
| Створені артефакти в кузні | Один кристал із щипцями | Палітра; грані/промені — шари лише за помітної різниці форми |

**Спільні декоративні деталі для бібліотеки шарів:** коротка лаврова гілка й вінок, круглий обідок медалі, проста стрічка, восьмипроменева зірка, маленький камінь, іскри. Не вставляти їх усюди автоматично: використовувати тільки там, де вони є в референсі й не забивають силует на 50 px.

У грі вже є локальний приклад такого підходу: `TournamentTrophy.tsx` перефарбовує одну текстуру під різні метали через WebGL, зберігаючи її альфа-канал. Це підтверджує технічну придатність шейдера, але поки що це логіка конкретного компонента турніру, а не спільний рендерер досягнень. Якщо дійдемо до реалізації, варто винести лише потрібну палітрову логіку в загальний компонент.

**Практичний порядок:** спершу згенерувати майстер-арт кожного сімейства; потім зробити контактний аркуш із трьома палітрами шейдера; лише після цього вирішувати, для яких рівнів потрібні окремі шари. Так спершу перевіряємо, скільки варіацій справді дає колір, перш ніж створювати зайві картинки.

## Спільний блок стилю

Додавати цей блок до кожного промпту нижче разом із його основою та варіантом рівня:

> Generate one new achievement icon, not a sheet or a set. Square 1:1 canvas, PNG with a fully transparent background. Keep one compact, centred emblem with a bold complete silhouette, filling about 72% of the canvas while leaving a clean transparent margin. It must remain immediately readable when reduced to 50 pixels. Style: dark gothic tarot woodcut, like an old hand-carved medieval block print. Pure black ink with flat warm cream paper fills only: heavy solid shapes, rough hand-cut contours, a few bold parallel cuts and coarse cross-hatching, no grey, no gradients, no airbrush, no modern gloss. Use large connected forms and very few interior marks. No card frame, no background scene, no letters, words, numerals, labels, logos, signature, or watermark. Make all light parts opaque cream; keep everything outside the emblem transparent.

### Як зібрати запит на один арт

Для майстер-арту сімейства склеїти спільний блок стилю з його основою. Не генерувати повторно весь значок для кожного рівня. Для рівнів спершу застосувати палітру; окремий промпт для прозорого шару потрібен тільки для геометричної різниці, якої не можна скласти з наявного майстра та спільних деталей. Перевіряти результат у 50 px: якщо різниця рівнів помітна лише через дрібний орнамент, прибрати її або зробити чітким окремим шаром.

Для додаткового шару в промпті окремо просити тільки новий елемент (наприклад, третю монету чи вінок), на такому самому квадратному прозорому полотні й у тому самому монохромному різьбленому стилі. Не перемальовувати основний символ у шарі. Підкладку, що змінює колір між рівнями, тримати окремим шейдерним шаром; прозорі пікселі основного PNG підкладку не забарвлять.

## Промпти

### Дуелі

#### Перемоги в дуелях — 3 рівні

Референси: [100 перемог](https://elem.mobi/img/ach/ach-duels-smiter-01.png), [20 000](https://elem.mobi/img/ach/ach-duels-smiter-02.png), [100 000](https://elem.mobi/img/ach/ach-duels-smiter-03.png).

**Основа:** A raised duelist’s gauntlet fist above a short laurel sprig on a small stone base; no visible arm beyond the wrist.

- **100 перемог:** One plain clenched gauntlet, two simple laurel leaves, no aura.
- **20 000 перемог:** The same fist backed by a small round engraved duelling medallion, with fuller laurel leaves.
- **100 000 перемог:** The same fist framed by a compact carved sunburst and a complete laurel wreath; keep the fist as the dominant silhouette.

#### Топ-100 дуелянтів — один рівень

Референс: [перехрещені мечі](https://elem.mobi/img/ach/ach-duels-top100.png).

**Промпт:** Two short medieval duelling swords crossed above a low laurel base, guards turned outward, one small central knot where the blades cross. Keep the emblem balanced and readable without a shield or text.

#### Перше місце в дуелях — один рівень

Референс: [коронований шолом](https://elem.mobi/img/ach/ach-duels-champion.png).

**Промпт:** A front-facing ceremonial duellist’s helmet with a compact crown-like crest and two swept wing-shaped cheek guards, carved as one strong heraldic silhouette. No face or visible eyes.

### Арена й турнір

#### Перемоги на арені — 3 рівні

Референси: [50 перемог](https://elem.mobi/img/ach/ach-arena-veteran-01.png), [3 000](https://elem.mobi/img/ach/ach-arena-veteran-02.png), [10 000](https://elem.mobi/img/ach/ach-arena-veteran-03.png).

**Основа:** A medieval arena sword planted point-down in a low stone base, upright and symmetrical.

- **50 перемог:** A simple sword and two small leaves at its base.
- **3 000 перемог:** The same sword with a more ornate crossguard and a narrow ribbon tied below the grip.
- **10 000 перемог:** The same sword framed by a bold eight-point woodcut burst and a fuller laurel base.

#### Переможені маги на арені — 3 рівні

Референси: [100 перемог](https://elem.mobi/img/ach/ach-arena-dangerenemy-01.png), [3 000](https://elem.mobi/img/ach/ach-arena-dangerenemy-02.png), [10 000](https://elem.mobi/img/ach/ach-arena-dangerenemy-03.png).

**Основа:** A small defeated sorcerer’s mask in profile, hooded and resting on a trophy plinth; make it a symbolic carved mask, not a portrait.

- **100 магів:** One plain hooded mask, a short base and two leaves.
- **3 000 магів:** The same mask with a brighter carved mantle and a second small crest behind it.
- **10 000 магів:** The same mask with a heavier horned crest, a large laurel arc and a bold radiant cut pattern.

#### Топ-100 арени — один рівень

Референс: [ряд із трьох тризубців](https://elem.mobi/img/ach/ach-arena-gladiator.png).

**Промпт:** Three upright arena tridents arranged as a compact heraldic group, the middle trident slightly taller, joined by one shared laurel base. Use broad prongs and uncluttered negative spaces.

#### Перше місце в рейтингу арени — один рівень

Референс: [корона арени](https://elem.mobi/img/ach/ach-arena-champion.png).

**Промпт:** A broad medieval champion’s crown with three high points, carved gems shown as simple cream openings, and a short laurel base. No lettering or numeric mark.

#### Чемпіон турніру майстрів — один рівень

Референс: [турнірна відзнака](https://elem.mobi/img/ach/ach-tournament-champion.png).

**Промпт:** A compact tournament cup with two angular handles, crossed lance and sword behind it, and a short laurel knot below. Keep it a single bold heraldic emblem, not a detailed scene.

### Нашестя Урфіна

#### Шкода босам за одне нашестя — 3 рівні

Референси: [1 млн](https://elem.mobi/img/ach/ach-urfin-veteran-01.png), [25 млн](https://elem.mobi/img/ach/ach-urfin-veteran-02.png), [100 млн](https://elem.mobi/img/ach/ach-urfin-veteran-03.png).

**Основа:** A rugged animal-like boss mask in three-quarter view, mounted on a small battle trophy plate; do not depict a named character.

- **1 млн шкоди:** A plain carved mask with one small ribbon on the plate.
- **25 млн:** The same mask with a stronger brow, a second ribbon and a few bold impact cuts.
- **100 млн:** The same mask with a heavier crown ridge, three ribbon tails and a large radiating impact frame.

#### Суперудари в нашесті — 3 рівні

Референси: [5 ударів](https://elem.mobi/img/ach/ach-urfin-fortuna-01.png), [25](https://elem.mobi/img/ach/ach-urfin-fortuna-02.png), [100](https://elem.mobi/img/ach/ach-urfin-fortuna-03.png).

**Основа:** A four-leaf clover on a low stone stand, each leaf broad and distinct.

- **5 суперударів:** One clover with a simple carved stem.
- **25:** Two overlapping clovers with a small luck-knot between them.
- **100:** Three clovers arranged as one compact crown-like cluster, with a fuller base.

#### Отримані карти за шкоду босу — 3 рівні

Референси: [1 раз](https://elem.mobi/img/ach/ach-urfin-hero-01.png), [10 разів](https://elem.mobi/img/ach/ach-urfin-hero-02.png), [50 разів](https://elem.mobi/img/ach/ach-urfin-hero-03.png).

**Основа:** A five-point star mounted on a small battle shield, with a narrow crossed-card silhouette behind it.

- **1 нагорода:** One large star on a plain shield.
- **10 нагород:** The same shield with two smaller companion stars and a stronger border.
- **50 нагород:** The same shield with three clear stars, a small laurel pair and a broad outer cut.

#### Перше місце за шкодою — 3 рівні

Референси: [1 карта](https://elem.mobi/img/ach/ach-urfin-champion-01.png), [5 карт](https://elem.mobi/img/ach/ach-urfin-champion-02.png), [20 карт](https://elem.mobi/img/ach/ach-urfin-champion-03.png).

**Основа:** A low victor’s crown above a small boss-trophy base.

- **1 перше місце:** A simple three-point crown with one central cream jewel.
- **5:** The same crown with two side jewels and a short laurel pair.
- **20:** The same crown with a higher central point, three large jewels and a complete laurel arc.

### Гільдія

#### Золото в казну — 3 рівні

Референси: [100 золота](https://elem.mobi/img/ach/ach-guild-patron-01.png), [10 000](https://elem.mobi/img/ach/ach-guild-patron-02.png), [50 000](https://elem.mobi/img/ach/ach-guild-patron-03.png).

**Основа:** A compact pile of medieval guild coins on a low stone plinth; coins have plain embossed sun marks, never numbers.

- **100 золота:** One upright coin and two flat coins.
- **10 000:** A neat stack of four coins with a small pouch behind it.
- **50 000:** A broader coin heap spilling from a tied guild purse, with a full laurel base.

#### Пожертви елементів у карту гільдії — 3 рівні

Референси: [50 000 елементів](https://elem.mobi/img/ach/ach-guild-elementalist-01.png), [500 000](https://elem.mobi/img/ach/ach-guild-elementalist-02.png), [5 млн](https://elem.mobi/img/ach/ach-guild-elementalist-03.png).

**Основа:** A smooth elemental orb held in a small three-footed stone stand.

- **50 000:** One plain orb with two simple incised arcs.
- **500 000:** The same orb with a second orbiting ring and a carved stand.
- **5 млн:** The same orb surrounded by three bold orbital arcs and a fuller, rune-free stand.

#### Дракони в рейдах — 3 рівні

Референси: [25 драконів](https://elem.mobi/img/ach/ach-guild-dragonhunter-01.png), [250](https://elem.mobi/img/ach/ach-guild-dragonhunter-02.png), [1 000](https://elem.mobi/img/ach/ach-guild-dragonhunter-03.png).

**Основа:** A dragon’s head and folded wings displayed as a heraldic trophy above a small laurel base.

- **25 перемог:** One compact dragon head with short folded wings.
- **250:** The same head with wider wings and a small broken spear below.
- **1 000:** The same head with fully spread angular wings and a bold laurel arc.

#### Ключі у війнах гільдій — 3 рівні

Референси: [25 ключів](https://elem.mobi/img/ach/ach-guild-keymaster-01.png), [150](https://elem.mobi/img/ach/ach-guild-keymaster-02.png), [300](https://elem.mobi/img/ach/ach-guild-keymaster-03.png).

**Основа:** Crossed medieval ward keys with large simple teeth and a small knot at the crossing.

- **25 ключів:** Two plain crossed keys.
- **150:** The same keys with a third small key upright behind them.
- **300:** Three ornate crossed keys with a full laurel base; keep each shaft distinct.

#### Участь у війнах гільдій — 3 рівні

Референси: [15 боїв](https://elem.mobi/img/ach/ach-guild-comradeinarms-01.png), [100](https://elem.mobi/img/ach/ach-guild-comradeinarms-02.png), [200](https://elem.mobi/img/ach/ach-guild-comradeinarms-03.png).

**Основа:** Two closed medieval helmets shoulder-to-shoulder above crossed short swords, a symbol of comradeship rather than a portrait.

- **15 боїв:** One small closed helmet and one short sword.
- **100:** Two matching helmets with crossed swords behind them.
- **200:** The same pair beneath a shared laurel arch and a broad shield-shaped backing.

#### Досвід у гільдії — 3 рівні

Референси: [30 млн](https://elem.mobi/img/ach/ach-guild-veteran-01.png), [3 млрд](https://elem.mobi/img/ach/ach-guild-veteran-02.png), [30 млрд](https://elem.mobi/img/ach/ach-guild-veteran-03.png).

**Основа:** A round guild shield bearing a simple carved sage profile in relief; no realistic face.

- **30 млн досвіду:** A plain round shield with one cream profile silhouette.
- **3 млрд:** The same shield with a raised rim and a small laurel branch.
- **30 млрд:** The same shield with a double rim, two laurel branches and a prominent central crest.

#### Перемоги над колдуніями — 3 рівні

Референси: [100](https://elem.mobi/img/ach/ach-raids-tweens-01.png), [200](https://elem.mobi/img/ach/ach-raids-tweens-02.png), [500](https://elem.mobi/img/ach/ach-raids-tweens-03.png).

**Основа:** A witch-hunter’s hooded lantern beside a small crooked witch hat, both joined into one clear trophy silhouette.

- **100 перемог:** A single low flame inside the lantern and one small hat.
- **200:** The same emblem with a taller flame and a broken twig crossing the base.
- **500:** The same emblem with a bold three-pronged flame, a thorn arc and a fuller base.

### Різні досягнення

#### Сила бойової колоди — 3 рівні

Референси: [30 000 сили](https://elem.mobi/img/ach/ach-stuff-strongdeck-01.png), [60 000](https://elem.mobi/img/ach/ach-stuff-strongdeck-02.png), [90 000](https://elem.mobi/img/ach/ach-stuff-strongdeck-03.png).

**Основа:** A small fan of magical cards with blank faces and a simple central star cut.

- **30 000:** Three cards in a shallow fan.
- **60 000:** The same fan of five cards with a stronger central card.
- **90 000:** The same fan with seven broad cards and a bold starburst behind the centre.

#### Зібрані колекції — 2 рівні

Референси: [10 колекцій](https://elem.mobi/img/ach/ach-stuff-collectioner-01.png), [15](https://elem.mobi/img/ach/ach-stuff-collectioner-02.png).

**Основа:** A symmetrical collector’s butterfly with broad, woodcut-patterned wings and a tiny central clasp.

- **10 колекцій:** One butterfly with two large patterned wings and a short laurel base.
- **15:** The same butterfly with a second pair of smaller wings and denser but still bold wing cuts.

#### Завершені крамниці скринь — 3 рівні

Референси: [1 крамниця](https://elem.mobi/img/ach/ach-stuff-chest-01.png), [50](https://elem.mobi/img/ach/ach-stuff-chest-02.png), [200](https://elem.mobi/img/ach/ach-stuff-chest-03.png).

**Основа:** A closed medieval treasure chest with a broad front latch, three-quarter view, no tiny lock details.

- **1 завершення:** A plain chest with a simple latch.
- **50:** The same chest with corner bands, a larger lock plate and two visible coins.
- **200:** The same chest with a carved lid, a heavy lock and a bold coin cluster at its feet.

#### Перемоги в марафоні — 2 рівні

Референси: [1 перемога](https://elem.mobi/img/ach/ach-stuff-marathon-01.png), [10](https://elem.mobi/img/ach/ach-stuff-marathon-02.png).

**Основа:** A winged medieval running sandal above a narrow laurel base, angled forward to suggest speed.

- **1 перемога:** One simple winged sandal with a short motion cut behind it.
- **10:** The same sandal with a second feathered wing and a small crown-like laurel knot.

#### Надіслані подарунки — 3 рівні

Референси: [20 подарунків](https://elem.mobi/img/ach/ach-stuff-presents-01.png), [100](https://elem.mobi/img/ach/ach-stuff-presents-02.png), [1 000](https://elem.mobi/img/ach/ach-stuff-presents-03.png).

**Основа:** A stack of medieval gift boxes tied with broad ribbon and a simple wax seal; no bows with fine loops.

- **20 подарунків:** One small square parcel with one broad cross-ribbon.
- **100:** Two stacked parcels with a larger seal and a second ribbon.
- **1 000:** Three parcels arranged as one compact tower, topped by a bold sealed medallion.

#### Отримані подарунки — 3 рівні

Референси: [10 подарунків](https://elem.mobi/img/ach/ach-stuff-favourite-01.png), [100](https://elem.mobi/img/ach/ach-stuff-favourite-02.png), [1 000](https://elem.mobi/img/ach/ach-stuff-favourite-03.png).

**Основа:** A pair of rounded heraldic hearts joined at their lower points above a tiny ribbon knot.

- **10 подарунків:** One large heart with a small cream highlight cut.
- **100:** Two overlapping hearts with one shared ribbon knot.
- **1 000:** Three overlapping hearts in a compact crown-like cluster with a laurel base.

### Спорядження

#### Створені речі в кузні — 3 рівні

Референси: [1 000 речей](https://elem.mobi/img/ach/ach-forge-items-01.png), [2 000](https://elem.mobi/img/ach/ach-forge-items-02.png), [3 000](https://elem.mobi/img/ach/ach-forge-items-03.png).

**Основа:** A blacksmith’s hammer resting diagonally on a compact anvil, with a few large sparks.

- **1 000 речей:** Plain hammer and anvil, one spark.
- **2 000:** The same tools with two sparks and a simple etched anvil face.
- **3 000:** The same tools with a bold three-spark burst and a small laurel base.

#### Створені артефакти в кузні — 3 рівні

Референси: [200 артефактів](https://elem.mobi/img/ach/ach-forge-arts-01.png), [500](https://elem.mobi/img/ach/ach-forge-arts-02.png), [1 000](https://elem.mobi/img/ach/ach-forge-arts-03.png).

**Основа:** A faceted magical crystal held upright by blacksmith’s tongs above a small anvil, one clear central silhouette.

- **200 артефактів:** One simple crystal between the tongs, with a single spark.
- **500:** The same crystal with a stronger cut facet and two sparks.
- **1 000:** The same crystal with a small crown of three bold rays and a fuller anvil base.

## Прийняття майбутніх результатів

- Кожна картинка генерується окремо; не просити модель намалювати весь комплект одним аркушем.
- Зовнішній фон прозорий, а світлі частини символу — непрозорий кремовий.
- Рівні однієї нагороди мають той самий силует, ракурс і масштаб; прогресія видима навіть у 50×50 px.
- Не переносити до гри темну прямокутну плашку референсу. Це лише іконка-нагорода, яку накладає наш інтерфейс.
- Перевіряти читабельність у фактичному розмірі, пропорційність і прозорість; не роздувати дрібні хрестові штрихи, які зіллються після зменшення.
