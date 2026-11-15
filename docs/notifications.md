# Сповіщення (push)

## Канали доставки

| Канал | Кому | Що потрібно | Статус |
|---|---|---|---|
| **Telegram-бот** | гравці з прив’язаним Telegram, які хоч раз натиснули «Старт» у боті | лише `TELEGRAM_BOT_TOKEN` (вже є) і `sendMessage` | **зроблено (v1)** |
| Web Push | веб-гравці без Telegram (Google, гості) | service worker, VAPID-ключі, таблиця підписок, бібліотека `web-push`; на iOS — тільки PWA, додана на головний екран | фаза 2 |

Чому почали з бота: працює і в Mini App, і для веб-гравців із прив’язаним Telegram, не потребує дозволу браузера,
service worker чи нових ключів, і повідомлення має кнопку «ГРАТИ», що відкриває Mini App.
Обмеження: бот може писати лише тим, хто запускав бота; Google- і гостьові акаунти без Telegram у v1 нічого не отримують.
`NotificationSender` — інтерфейс каналу, Web Push підключається поруч без змін у тригерах.

## Як це працює

Тригери читаються зі стану бази періодичним **sweep** — код дуелей, пошти й чату не змінюється:

- `GET|POST /api/internal/notifications/sweep` з `Authorization: Bearer $CRON_SECRET` (той самий заголовок шле Vercel Cron).
  Без `CRON_SECRET` маршрут закритий (401).
- Один sweep за раз (рядок-оренда `notification_sweep_lease`; advisory lock не підходить для пулера Neon).
- За прогін не більше `NOTIFICATION_SWEEP_BUDGET` (60) повідомлень; решта — у наступному прогоні.
  429 від Telegram зупиняє прогін.
- 403 або «chat not found» → `telegram_blocked_at`, гравцеві більше не пишемо, доки він не збереже налаштування.
- Події, старші за добу, не оголошуються (щоб перший запуск не розсилав старе).

| Тип | Умова | Повтор |
|---|---|---|
| `duelReady` | `duel_remaining = 0`, `duel_refill_at` минув (перерва ліниво знімається в `getDuelAvailability`), гравець не заходив після цього | раз на кожну перерву (`duel_notified_refill_at`) |
| `mail` | непрочитані листи `player_mail`, новіші за останній візит | одне повідомлення з кількістю; не частіше ніж раз на 30 хв |
| `guild` | повідомлення інших членів у чаті рейдів гільдії (`guild_raid_chat_messages`), новіші за останній візит | не частіше ніж раз на 3 год |
| `announcements` | найновіший рядок `notification_announcements` за 7 днів, якого гравець ще не отримав | один раз на оголошення |
| `winback` | `last_seen_at` від 3 до 30 днів тому | одне нагадування на кожну відсутність |

Особистих повідомлень між гравцями в грі поки немає — «особисте» означає пошту (`player_mail`, туди ж падають нагороди рейдів).

Оголошення додається вручну SQL-запитом (текст до 1000 символів, переклади необов’язкові, замість них — українська):

```sql
INSERT INTO notification_announcements (body_uk, body_en, body_de, body_ru)
VALUES ('Оновлення: …', 'Update: …', 'Update: …', 'Обновление: …');
```

## Налаштування гравця

- `GET /api/player/notifications` → `NotificationSettingsResponse` (`shared/src/notifications.ts`).
- `PUT /api/player/notifications` `{ preferences?: { duelReady?: boolean, … }, locale?: "uk"|"en"|"de"|"ru" }`.
  Без рядка в `player_notification_settings` усе увімкнено, мова — українська; клієнт надсилає мову інтерфейсу при кожній зміні.
- UI: секція «СПОВІЩЕННЯ» в `SettingsScreen` (`components/NotificationSettingsSection.tsx`), ті самі `MenuRow`, що й «Звуки».

## Файли

- міграція `server/migrations/094_player_notifications.sql`;
- `server/src/notifications/notificationService.ts` (sweep, налаштування, канал Telegram), `notificationRoute.ts`;
- тексти бота `server/src/bot/notificationTexts.ts`;
- тести `notificationService.test.ts`, `notificationService.integration.test.ts` (у транзакції з ROLLBACK).

## Запуск у проді (ще не зроблено)

1. Застосувати 094 на Neon вручну.
2. Додати `CRON_SECRET` у змінні Vercel.
3. Викликати sweep кожні 5 хв. Vercel Cron на тарифі Hobby — лише раз на добу, тож або Pro
   (`"crons": [{ "path": "/api/internal/notifications/sweep", "schedule": "*/5 * * * *" }]` у `vercel.json`),
   або зовнішній планувальник (cron-job.org, GitHub Actions `schedule`) з тим самим заголовком.
