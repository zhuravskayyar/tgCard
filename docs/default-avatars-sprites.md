# Стандартні аватари гравців

У HUD, бою, профілях і рейтингах гравець без фото з Telegram бачить стабільний портрет, вибраний за ID. Усі 20 портретів готові. Номер поки обчислюється в UI, а не зберігається в профілі. `photoUrl = "avatar:NN"` уже підтримується для явного вибору з готових портретів, але екрана вибору в налаштуваннях ще немає. Фото з Telegram показується як є.

## Стиль (за референсом користувача)

Від референсу береться тільки манера, без копіювання персонажа:

- Чорна туш і **один** колір. Фон — суцільна насичена заливка цього кольору. Світлі місця персонажа — світліший відтінок того самого кольору. Білий — лише для іскор, зірок, відблисків і очей.
- Зернистий сухий пензель, рвані краї тіні, легкий друкарський шум.
- Великі прості силуети, що читаються навіть на 40 px.
- Похмуро-казковий настрій із часткою гумору: лицар тримає кота, а не просто стоїть у шоломі.

## Формат

- 20 окремих квадратних файлів 1024×1024 PNG без тексту й рамок.
- Головне — голова або морда — в центральному колі: овал HUD (236×246) і круглі аватари в бою та рейтингу обріжуть кути.
- Імена файлів: `client/public/assets/ui/avatars/avatar-01.png` … `avatar-20.png`. Після оптимізації — `.webp`.

Окремі файли надійніші за сітку: ChatGPT часто зсуває клітинки. Генеруй по одному, підставляючи рядок із таблиці в загальний промпт.

## Загальний промпт

```text
Square 1024x1024 avatar illustration, no text, no border, no frame, no watermark.
Two-tone ink style: solid flat {COLOR} background; the subject drawn in heavy black ink with grainy dry-brush shading and ragged shadow edges; highlights only in a lighter tint of the same {COLOR}; pure white only for small stars, sparkles, glints and glowing eyes. Slight risograph print grain.
Moody storybook fantasy with a touch of humor, big simple readable silhouette, bust or head-and-shoulders, centered; the face fully inside the central circle, the corners calm background only.
Subject: {SUBJECT}.
```

## 20 аватарів

| № | {COLOR} | {SUBJECT} |
| --- | --- | --- |
| 01 | violet | a hooded knight in a great helm holding a sleepy black cat, falling stars |
| 02 | crimson red | a horned imp grinning, holding a tiny candle, sparks |
| 03 | burnt orange | a fox mage in a pointed hat with a glowing ember on its paw |
| 04 | teal | a drowned sailor skeleton in a captain's hat with a little fish swimming by |
| 05 | cobalt blue | a frost witch with long braids, snowflakes drifting |
| 06 | mint green | a frog prince with a bent crown, fireflies |
| 07 | olive green | an old druid with antlers and moss in the beard, a beetle on the shoulder |
| 08 | mustard yellow | a lion warrior in a dented pauldron, sun rays and dust |
| 09 | pink | a vampire countess with a high collar holding a teacup, bats |
| 10 | sky blue | an owl scholar with round spectacles and a quill, stars |
| 11 | rust brown | a dwarf miner with a lantern and a soot-smudged face, sparks of ore |
| 12 | deep purple | a plague doctor with a beaked mask and a small raven, smoke |
| 13 | emerald | a goblin thief grinning, holding a stolen gold coin, glints |
| 14 | slate grey | a stone golem with one glowing eye crack, pebbles floating |
| 15 | magenta | a cheshire-like cat spirit with a wide white grin, swirling stars |
| 16 | navy blue | a sea serpent coiling with a lighthouse beam behind |
| 17 | coral | a mermaid bard with a shell lute, bubbles |
| 18 | lime green | a mushroom gnome with a huge spotted cap, spores glowing |
| 19 | amber | a griffin rider in leather goggles, wind streaks |
| 20 | blood orange | a dragon hatchling peeking out of a cracked egg, embers |

## Статус і наступні кроки

1. Готові `avatar-01.webp` … `avatar-20.webp` (320×320). Для них UI стабільно обирає номер за ID гравця; явний `avatar:NN` теж відображається.
2. Окремою задачею додати вибір аватара в налаштуваннях і зберігати `avatar:NN` у профілі; до цього гравець не може змінити портрет вручну.
