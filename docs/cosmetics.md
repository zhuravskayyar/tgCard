# Косметика та інвентар

## Нікові скіни

`nickname_skin_pack_01` — одна пропозиція магазину за 250 Arena Tokens. Вона містить три незалежні міфічні стилі: `blood_moon`, `starforged` і `broken_signal`. Кожна покупка приймає конкретний `choiceId`, тому сервер списує жетони лише після підтвердження вибору й не дозволяє придбати вже відкритий стиль.

Власність зберігається в `player_cosmetics` (`cosmetic_type = 'nickname_skin'`). Активний стиль зберігається окремо в `players.equipped_nickname_skin`; реальний Telegram username не змінюється.

## API

- `GET /api/shop/nickname-skins` — набір, баланс жетонів, відкриті стилі та прогрес `0/3`.
- `POST /api/shop/nickname-skins/purchase` з `{ "choiceId": "blood_moon" }` — атомарно відкриває стиль, списує 250 Arena Tokens і автоматично екіпірує вибраний стиль.
- `GET /api/player/inventory` — інвентар із секціями `cosmetics` та `items`.
- `POST /api/player/inventory/nickname-skin/equip` з `{ "skinId": "starforged" }` або `{ "skinId": null }` — перемикає вже придбаний стиль або повертає стандартне оформлення.

Надалі нові серії можуть додаватися як окремі набори з власним ID та списком choices, не змішуючи їх із картковими пропозиціями.
