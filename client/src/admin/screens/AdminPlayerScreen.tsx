import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AdminCardDefinitionItem, AdminCurrency, AdminPlayerDetailResponse } from "@cardastika/shared";
import { CurrencyIcon } from "../../components/CurrencyDisplay";
import {
  AdminApiError,
  changeAdminPlayerCurrency,
  changeAdminPlayerLevel,
  grantAdminPlayerCards,
  loadAdminCards,
  loadAdminPlayer,
  removeAdminPlayerCard,
} from "../adminApi";
import { elementLabels, formatDate, formatNumber, playerName, rarityLabels } from "../adminFormat";
import { AdminPagination } from "../AdminPagination";
import { AdminEmpty, AdminError, AdminLoading } from "../AdminStates";

interface CurrencyEditorProps {
  currency: AdminCurrency;
  current: number;
  disabled: boolean;
  onChange: (currency: AdminCurrency, delta: number) => void;
}

function CurrencyEditor({ currency, current, disabled, onChange }: CurrencyEditorProps) {
  const [amount, setAmount] = useState("100");
  const label = currency === "silver" ? "Срібло" : "Золото";
  const submit = (sign: 1 | -1) => {
    const parsed = Number(amount);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return;
    onChange(currency, parsed * sign);
  };
  return (
    <article className={`admin-balance-editor admin-balance-editor--${currency}`}>
      <div className="admin-balance-editor__summary">
        <span className="admin-balance-editor__icon"><CurrencyIcon kind={currency} size={34} /></span>
        <span><small>Поточний баланс</small><strong>{formatNumber(current)}</strong><span>{label}</span></span>
      </div>
      <div className="admin-balance-editor__controls">
        <label className="admin-field"><span>Сума зміни</span><input aria-label={`Сума зміни: ${label}`} disabled={disabled} min="1" onChange={(event) => setAmount(event.target.value)} type="number" value={amount} /></label>
        <div className="admin-balance-editor__actions">
          <button className="admin-button admin-button--positive" disabled={disabled} onClick={() => submit(1)} type="button">+ Додати</button>
          <button className="admin-button admin-button--danger-soft" disabled={disabled} onClick={() => submit(-1)} type="button">− Зняти</button>
        </div>
      </div>
    </article>
  );
}

interface GrantFormProps {
  disabled: boolean;
  onGrant: (cardId: string, quantity: number, level: number, cardName: string) => void;
}

function GrantCardForm({ disabled, onGrant }: GrantFormProps) {
  const [search, setSearch] = useState("");
  const [cards, setCards] = useState<AdminCardDefinitionItem[]>([]);
  const [cardId, setCardId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [level, setLevel] = useState("1");
  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void loadAdminCards({ search, page: 1, limit: 30, sort: "name", direction: "asc" }, controller.signal)
        .then((result) => {
          setCards(result.cards);
          setCardId((current) => result.cards.some(({ id }) => id === current) ? current : result.cards[0]?.id ?? "");
        })
        .catch(() => undefined);
    }, 250);
    return () => { window.clearTimeout(timeoutId); controller.abort(); };
  }, [search]);
  const selectedCard = cards.find(({ id }) => id === cardId);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    const parsedLevel = Number(level);
    if (!selectedCard || !Number.isSafeInteger(parsedQuantity) || !Number.isSafeInteger(parsedLevel)) return;
    onGrant(selectedCard.id, parsedQuantity, parsedLevel, selectedCard.displayName ?? selectedCard.code);
  };
  return (
    <form className="admin-grant-form" onSubmit={submit}>
      <label className="admin-field"><span>Знайти карту</span><input disabled={disabled} onChange={(event) => setSearch(event.target.value)} placeholder="Назва або код" type="search" value={search} /></label>
      <label className="admin-field admin-field--wide"><span>Карта</span><select disabled={disabled || cards.length === 0} onChange={(event) => setCardId(event.target.value)} value={cardId}>{cards.map((card) => <option key={card.id} value={card.id}>{card.displayName ?? card.code} · {elementLabels[card.element]}</option>)}</select></label>
      <label className="admin-field"><span>Кількість</span><input disabled={disabled} max="20" min="1" onChange={(event) => setQuantity(event.target.value)} type="number" value={quantity} /></label>
      <label className="admin-field"><span>Рівень карти</span><input disabled={disabled} max="50" min="1" onChange={(event) => setLevel(event.target.value)} type="number" value={level} /></label>
      <button className="admin-button" disabled={disabled || !cardId} type="submit">Додати карту</button>
    </form>
  );
}

export function AdminPlayerScreen({ onNavigate, playerId }: { onNavigate: (path: string) => void; playerId: string }) {
  const [cardPage, setCardPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<AdminPlayerDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [levelDraft, setLevelDraft] = useState("1");
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void loadAdminPlayer(playerId, cardPage, controller.signal)
      .then((result) => {
        setData(result);
        setLevelDraft(String(result.player.level));
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof AdminApiError ? requestError.message : "Невідома помилка");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cardPage, playerId, refreshKey]);

  const runMutation = useCallback(async (operation: () => Promise<{ message: string }>) => {
    setPending(true);
    setNotice(null);
    try {
      const result = await operation();
      setNotice({ kind: "success", text: result.message });
      setRefreshKey((key) => key + 1);
    } catch (mutationError) {
      setNotice({ kind: "error", text: mutationError instanceof Error ? mutationError.message : "Операцію не виконано" });
    } finally {
      setPending(false);
    }
  }, []);

  const handleCurrency = (currency: AdminCurrency, delta: number) => {
    const currencyName = currency === "silver" ? "срібла" : "золота";
    if (!window.confirm(`${delta > 0 ? "Додати" : "Зняти"} ${formatNumber(Math.abs(delta))} ${currencyName}?`)) return;
    void runMutation(() => changeAdminPlayerCurrency(playerId, currency, delta));
  };
  const handleLevel = () => {
    const level = Number(levelDraft);
    if (!Number.isSafeInteger(level) || level < 1 || level > 120 || !window.confirm(`Змінити рівень гравця на ${level}?`)) return;
    void runMutation(() => changeAdminPlayerLevel(playerId, level));
  };
  const handleGrant = (cardId: string, quantity: number, level: number, cardName: string) => {
    if (!window.confirm(`Додати «${cardName}» × ${quantity}, рівень ${level}?`)) return;
    void runMutation(() => grantAdminPlayerCards(playerId, cardId, quantity, level));
  };
  const handleRemove = (instanceId: string, cardName: string, inDeck: boolean) => {
    const deckWarning = inDeck ? " Активну колоду буде автоматично перебудовано; якщо це неможливо, сервер скасує операцію." : "";
    if (!window.confirm(`Видалити «${cardName}» з інвентарю?${deckWarning}`)) return;
    void runMutation(() => removeAdminPlayerCard(playerId, instanceId));
  };

  const deckPower = useMemo(() => data?.deck.reduce((sum, card) => sum + card.finalPower, 0) ?? 0, [data?.deck]);

  if (loading && !data) return <AdminLoading label="Завантажуємо профіль гравця…" />;
  if (error && !data) return <AdminError message={error} onRetry={() => setRefreshKey((key) => key + 1)} />;
  if (!data) return null;

  const { player } = data;
  return (
    <div className="admin-page">
      <button className="admin-back" onClick={() => onNavigate("/admin/players")} type="button">← До списку гравців</button>
      <div className="admin-player-head">
        <div className="admin-player-head__avatar">{playerName(player).slice(0, 2).toUpperCase()}</div>
        <div><p className="admin-eyebrow">ПРОФІЛЬ ГРАВЦЯ</p><h1>{playerName(player)}</h1><p>{player.username ? `@${player.username} · ` : ""}{player.telegramUserId ? `Telegram ${player.telegramUserId}` : "Без Telegram-ідентичності"}</p></div>
        <div className="admin-player-head__meta"><span>Створено {formatDate(player.createdAt)}</span><code>{player.id}</code></div>
      </div>
      {notice ? <div className={`admin-toast admin-toast--${notice.kind}`} role="status">{notice.text}<button aria-label="Закрити" onClick={() => setNotice(null)} type="button">×</button></div> : null}

      <div className="admin-player-grid">
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><h2>Баланс</h2><p>Кожна зміна потребує підтвердження й потрапляє в audit log.</p></div></div>
          <div className="admin-balance-grid">
            <CurrencyEditor currency="silver" current={player.silver} disabled={pending} onChange={handleCurrency} />
            <CurrencyEditor currency="gold" current={player.gold} disabled={pending} onChange={handleCurrency} />
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><h2>Прогрес</h2><p>Допустимий рівень акаунта: 1–120.</p></div></div>
          <div className="admin-level-editor"><span className="admin-level-badge admin-level-badge--large">{player.level}</span><label className="admin-field"><span>Новий рівень</span><input disabled={pending} max="120" min="1" onChange={(event) => setLevelDraft(event.target.value)} type="number" value={levelDraft} /></label><button className="admin-button" disabled={pending || Number(levelDraft) === player.level} onClick={handleLevel} type="button">Зберегти рівень</button></div>
        </section>
      </div>

      <section className="admin-panel">
        <div className="admin-panel__heading"><div><h2>Активна колода</h2><p>{data.deck.length}/9 карт · сила {formatNumber(deckPower)} · перебудову контролює сервер</p></div></div>
        <div className="admin-deck-grid">{data.deck.map((card) => <article key={card.instanceId}><span>{card.slot}</span><div><strong>{card.displayName ?? card.code}</strong><small>{elementLabels[card.element]} · {rarityLabels[card.rarity]}</small></div><b>{formatNumber(card.finalPower)}</b></article>)}</div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel__heading"><div><h2>Додати карту</h2><p>Рідкість визначається сервером із рівня карти, як і в основній грі.</p></div></div>
        <GrantCardForm disabled={pending} onGrant={handleGrant} />
      </section>

      <section className="admin-panel admin-table-panel">
        <div className="admin-panel__heading"><div><h2>Інвентар карт</h2><p>{formatNumber(data.cardsPagination.total)} екземплярів</p></div></div>
        {data.cards.length === 0 ? <AdminEmpty message="У цього гравця немає карт." /> : (
          <>
            <div className={`admin-table-wrap${loading ? " admin-table-wrap--updating" : ""}`}><table className="admin-table"><thead><tr><th>Карта</th><th>Стихія</th><th>Рідкість</th><th>Рівень</th><th>Сила</th><th>Стан</th><th><span className="admin-sr-only">Дія</span></th></tr></thead><tbody>{data.cards.map((card) => <tr key={card.instanceId}><td data-label="Карта"><strong>{card.displayName ?? card.code}</strong><small>{card.code}</small></td><td data-label="Стихія">{elementLabels[card.element]}</td><td data-label="Рідкість"><span className={`admin-rarity admin-rarity--${card.rarity}`}>{rarityLabels[card.rarity]}</span></td><td data-label="Рівень">{card.level}</td><td data-label="Сила">{formatNumber(card.finalPower)}</td><td data-label="Стан">{card.inDeck ? <span className="admin-status admin-status--active">У колоді · слот {card.slot}</span> : <span className="admin-status">Інвентар</span>}</td><td><button className="admin-icon-button admin-icon-button--danger" disabled={pending} onClick={() => handleRemove(card.instanceId, card.displayName ?? card.code, card.inDeck)} title={card.inDeck ? "Колоду буде перебудовано транзакційно" : "Видалити карту"} type="button">×</button></td></tr>)}</tbody></table></div>
            <AdminPagination onPageChange={setCardPage} page={data.cardsPagination.page} total={data.cardsPagination.total} totalPages={data.cardsPagination.totalPages} />
          </>
        )}
      </section>
    </div>
  );
}
