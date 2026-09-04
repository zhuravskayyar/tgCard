import type { ReactNode } from "react";
import { GUILD_CONFIG, GUILD_ROLE_LABELS, type CardElement, type GuildLanguage, type GuildRecruitmentMode, type GuildRole } from "@cardastika/shared";
import { GuildApiError } from "../../telegram/guild";

export type AsyncState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; message: string };
export const LANGUAGE_LABELS: Record<GuildLanguage, string> = { uk: "Українська", ru: "Русский", en: "English", de: "Deutsch", other: "Інша" };
export const ELEMENT_LABELS: Record<CardElement, string> = { fire: "Вогонь", water: "Вода", air: "Повітря", earth: "Земля" };
export const MODE_LABELS: Record<GuildRecruitmentMode, string> = { open: "Відкритий набір", application: "За заявкою", closed: "Набір закритий" };
export const ROLE_ORDER: readonly GuildRole[] = ["leader", "officer", "veteran", "member", "newbie"];
export const GUILD_EMBLEM_OPTIONS = [
  { id: "shield-1", label: "Сонце" },
  { id: "shield-2", label: "Місяць" },
  { id: "shield-3", label: "Вогонь" },
  { id: "shield-4", label: "Вода" },
  { id: "shield-5", label: "Листок" },
  { id: "shield-6", label: "Гора" },
  { id: "shield-7", label: "Кристал" },
  { id: "shield-8", label: "Зірка" },
] as const;
export const formatNumber = (value: number) => new Intl.NumberFormat("uk-UA").format(value);
export const formatDate = (value: string) => new Date(value).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function guildEmblemIndex(emblemId?: string) {
  const match = emblemId ? /^shield-([1-8])$/u.exec(emblemId) : null;
  return match ? Number(match[1]) - 1 : 0;
}

export function guildErrorMessage(error: unknown) {
  if (!(error instanceof GuildApiError)) return "Не вдалося зв’язатися із сервером. Перевірте з’єднання та повторіть спробу.";
  if (error.status === 401) return "Сесія завершилася. Відкрийте гру знову або увійдіть у свій профіль.";
  const messages: Record<string, string> = {
    active_application_exists: "У вас уже є заявка на розгляді. Спочатку відкличте її.",
    already_in_guild: "Ви вже перебуваєте в гільдії. Одночасно вступити до іншої не можна.",
    applicant_already_in_guild: "Цей гравець уже вступив до гільдії. Оновіть список заявок.",
    guild_cooldown: error.retryAt ? `Повторна спроба буде доступна ${formatDate(error.retryAt)}.` : "Ще діє перерва після виходу, виключення або відхилення заявки. Спробуйте пізніше.",
    guild_full: "Усі місця зайняті. Виберіть іншу гільдію або спробуйте пізніше.",
    guild_name_taken: "Гільдія з такою назвою вже існує. Виберіть іншу назву.",
    guild_name_too_short: `Назва має містити щонайменше ${GUILD_CONFIG.nameMinLength} символи.`,
    guild_name_too_long: `Назва має містити не більше ${GUILD_CONFIG.nameMaxLength} символів.`,
    guild_name_invalid: "Використайте українські або латинські літери, цифри, пробіли, дефіс чи апостроф.",
    guild_name_double_space: "Приберіть подвійні пробіли з назви.",
    guild_description_too_long: "Опис задовгий. Скоротіть його до 500 символів.",
    invalid_guild_emblem: "Виберіть один із доступних щитів гільдії.",
    application_message_too_long: "Повідомлення задовге. Скоротіть його до 500 символів.",
    insufficient_silver: "Недостатньо срібла для створення гільдії.",
    insufficient_gold: "Недостатньо золота для посилення Алтаря.",
    treasury_cooldown: error.retryAt ? `Внески відкриються ${formatDate(error.retryAt)}.` : "Внески відкриються через три дні після вступу.",
    treasury_insufficient_silver: "Недостатньо срібла для цього внеску.",
    treasury_insufficient_gold: "Недостатньо золота для цього внеску.",
    treasury_card_not_selected: "Лідер ще не виставив карту гільдії.",
    treasury_card_not_owned: "Одна з карт уже недоступна. Оновіть список карт.",
    treasury_card_in_deck: "Карту з активної колоди не можна пожертвувати.",
    treasury_card_protected: "Захищену карту не можна пожертвувати.",
    leader_transfer_required: "Спочатку передайте лідерство іншому учаснику.",
    leader_must_dissolve: "Ви єдиний учасник. Скористайтеся дією «Розпустити гільдію».",
    guild_unlock_level: `Гільдії відкриваються з ${GUILD_CONFIG.unlockLevel} рівня.`,
    guild_min_level: "Ваш рівень нижчий за вимогу цієї гільдії.",
    guild_permission_denied: "У вас немає права на цю дію. Можливо, ваша роль змінилася — оновіть гільдію.",
    guild_not_found: "Гільдію не знайдено. Можливо, її вже розпустили.",
    not_guild_member: "Ви більше не учасник цієї гільдії. Оновіть дані.",
    guild_not_open: "Прямий вступ недоступний. Оновіть гільдію, щоб перевірити режим набору.",
    guild_closed: "Набір до цієї гільдії закритий.",
    guild_accepts_direct_join: "Заявка не потрібна: ця гільдія приймає одразу. Оновіть дані.",
    application_not_found: "Заявка вже не активна. Оновіть дані, щоб побачити її стан.",
    application_expired: "Термін заявки минув. Гравець може подати нову заявку.",
    guild_not_empty: "Розпустити гільдію можна лише тоді, коли в ній залишився один лідер.",
    cannot_change_own_role: "Не можна змінювати власну роль.",
    database_unavailable: "Дані гільдій тимчасово недоступні. Спробуйте ще раз.",
    forum_private: "Ця зала доступна лише учасникам гільдії.",
    forum_topic_locked: "Тему закрито модератором.",
    forum_topic_not_found: "Тему не знайдено. Оновіть форум.",
    forum_section_not_found: "Залу не знайдено. Оновіть форум.",
    announcement_too_long: "Оголошення має бути не довшим за 280 символів.",
    raid_not_member: "До івенту можуть приєднатися лише учасники цієї гільдії.",
    raid_not_open: "Івент гільдії вже активний або завершений.",
    raid_not_enrolled: "Спочатку приєднайтеся до івенту.",
    raid_not_leader: "Відкрити івент може тільки глава гільдії.",
    raid_not_active: "Спочатку глава гільдії має відкрити івент.",
    raid_battle_not_found: "Бій івенту вже завершено. Оновлюю стан.",
    raid_state_conflict: "Стан бою змінився. Спробуйте ще раз.",
    raid_target_defeated: "Цю відьму вже переможено. Оберіть іншу ціль.",
    raid_deck_invalid: "Потрібна повна бойова колода 3/2/2/2.",
    raid_unavailable: "Дві відьми для івенту тимчасово недоступні.",
    raid_invalid: "Стан івенту пошкоджений. Спробуйте ще раз.",
  };
  return messages[error.code] ?? "Не вдалося виконати дію. Оновіть дані та повторіть спробу.";
}

export function GuildState({ children, error = false, onRetry }: { children: ReactNode; error?: boolean; onRetry?: () => void }) {
  return <div className={`guild-state${error ? " guild-state--error" : ""}`} role={error ? "alert" : "status"}>
    <span>{children}</span>
    {onRetry ? <button className="guild-secondary-button" onClick={onRetry} type="button">Повторити</button> : null}
  </div>;
}

export function GuildEmblem({ emblemId }: { emblemId: string }) {
  const index = guildEmblemIndex(emblemId);
  const row = Math.floor(index / 4);
  return <span className="guild-emblem" aria-hidden="true"><span className="guild-emblem__sprite" style={{ backgroundPosition: `${(index % 4) * 33.333333}% ${row === 0 ? "25%" : "68%"}` }} /></span>;
}

export function GuildRoleBadge({ role }: { role: GuildRole }) {
  return <span className={`guild-role guild-role--${role}`}>
    <span className="guild-role__badge" style={{ backgroundPosition: `${ROLE_ORDER.indexOf(role) * 25}% 0%` }} aria-hidden="true" />
    {GUILD_ROLE_LABELS[role]}
  </span>;
}
