# Головна гільдії: нова ієрархія

Статус: план на погодження (2026-11-12). Код ще не змінено.

## Порядок блоків зверху вниз

1. **Шапка гільдії**: герб (`GuildEmblem`), назва, рівень, смужка XP
   (`guild.experience / nextLevelExperience`), «7/30 учасників».
2. **Карта гільдії**: мініатюра, рівень, смужка прогресу (`ExperienceFlask`, як на екрані
   Карти гільдії), позначка «Можна підняти» (`canLevelUp && availability === "ready"`),
   золота печатка, якщо наступний рівень золотий (`progression.isGoldLevel`).
   Тап відкриває повний екран Карти гільдії (вкладка `card`, новий проп `onCard`).
3. **Вісник**: 2 рядки + «Читати далі»; олівець лише з правом `manage_announcements`.
4. **Рядки `MenuRow`** зі статусом праворуч:
   - Казна: «Внесок доступний» або час до внеску (`treasury.viewer`);
   - Івент гільдії (Відьми): без статусу, доки сервер не віддає стан рейду в профілі;
   - Алтар: рівень алтаря `altar.currentLevel` (зараз помилково показує рівень гільдії),
     «можна підсилити», якщо `upgrades.some(canAfford)`;
   - Склад: «7/30», червона печатка з числом заявок для тих, хто їх приймає;
   - Журнал, Форум; Чат залишається заблокованим;
   - один приглушений рядок «Скоро: Війна гільдій, Арена» (`locked`).
5. Найкращі гільдії, керування, вихід — як зараз, унизу.

Логіку статусів винести в чисту функцію `client/src/screens/guild/guildHubState.ts`, спільну
для головної й екрана Карти гільдії. `MenuRow` уже має слоти `badge`, `detail`, `attention`,
`actionContent` і `locked` — новий компонент не потрібен.

## Що міняється поза головною

- `client/e2e/smoke.spec.ts`: тест відкриває модальне вікно Карти гільдії з головної і
  редагує вісник прямо на головній — оновити під новий потік.
- Переклади нових підписів у `client/src/locales/screenTranslations.ts`.
- Пізніше (окремо): поле стану рейду в профілі гільдії на сервері, щоб рядок Івенту
  показував «триває / набір / час до кінця».

## Етапи

1. **Без нового арту**: перебудувати головну на наявних спрайтах — медальйони
   `guild/medal-raid-v1.webp`, `medal-altar-v1.webp`, `medal-war-v1.webp`, сувій
   `guild/forum-topic-v1.webp` як іконки рядків, червона печатка `ui/trials/board/seal-v1.webp`
   як сповіщення, `ExperienceFlask` для смужок.
2. **Після генерації**: підставити широкі ілюстрації рядків і печатки.

## Спрайти на генерацію (9 файлів)

Спільний стиль (додати в кінець кожного промпту):

> Hand-drawn antique book engraving, fine sepia ink cross-hatching on aged warm parchment,
> bronze and umber tones only, soft worn edges, transparent background, a single object,
> centered, nothing cropped, no text, no letters, no numbers, no logos, no frame.

### Ілюстрації рядків — 480×228 px, PNG з прозорим фоном

Як наявні `client/public/assets/ui/home/sprites/row-*.webp`: предмет стоїть на легкій
тіні, займає праву частину кадру не більше ніж на 90 % висоти.

1. `guild-row-treasury.png` — Open iron-banded wooden chest overflowing with coins and a few
   gems, a ring of keys hanging from the lock.
2. `guild-row-event.png` — Gnarled witch cauldron with a bubbling brew, a crooked broom and a
   raven perched on its rim.
3. `guild-row-altar.png` — Small carved stone altar with a shallow bowl of glowing liquid,
   flanked by two potion flasks and two candles.
4. `guild-row-members.png` — Long wooden guild table with several empty high-backed chairs and
   a hanging banner without any emblem.
5. `guild-row-journal.png` — Open leather-bound ledger book with a ribbon bookmark, a quill and
   an inkwell.
6. `guild-row-forum.png` — Wooden notice board with several pinned blank parchment scrolls and
   a small lantern hanging from its corner.
7. `guild-row-soon.png` — Crossed sword and axe over a cracked round shield, with a small
   coliseum arch behind them, slightly faded as if not yet reached.

### Печатки

8. `guild-count-seal.png` — 128×128 px. Round deep-red wax seal with a slightly irregular edge
   and a plain, completely empty embossed center disc where a number will be overlaid.
9. `guild-gold-seal.png` — 96×96 px. Round gold-wax seal with an embossed five-pointed star
   and a burnished brass rim.

Готові PNG покласти в `client/public/assets/guild/` (будуть конвертовані у `.webp`).
